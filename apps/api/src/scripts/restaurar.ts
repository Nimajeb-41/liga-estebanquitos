/**
 * Restaura la temporada desde `temporada/2026-1.json`.
 *
 *     npm run restaurar
 *
 * Carga en la base de datos de `DATABASE_URL` todo lo que dice el archivo:
 * plantilla, calendario, fechas, resultados de J1-J7, walkovers y las jornadas
 * 8 y 9 programadas. Al terminar compara la clasificación que calcula la liga
 * con la que el archivo dice que tiene que salir, y si no coinciden lo dice.
 *
 * Como `season-start`, todo se hace **llamando a la API con sesión de
 * administrador**: no se escribe una fila a mano. Cada paso pasa por las mismas
 * validaciones que en el panel y deja su rastro en la auditoría.
 *
 * Las fechas: el servidor se arranca con un reloj propio que se coloca en la
 * fecha de cada partido antes de registrarlo, para que «jugado el...» diga el
 * domingo de su jornada y no el día de la restauración. La auditoría no se
 * engaña: su marca de tiempo la pone la base de datos, así que siempre dice
 * cuándo se restauró de verdad.
 *
 * Solo trabaja sobre una base sin calendario. Si ya hay uno, se niega: pisar
 * una temporada en marcha sin querer es justo lo que no puede pasar.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { schema } from '@liga/database';
import { createDatabase } from '@liga/database/client';
import { createLocalDatabase, isLocalDatabaseUrl } from '@liga/database/local';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { ConfigError, loadConfig } from '../config.ts';
import { buildServer } from '../server.ts';
import { RUTA_TEMPORADA, type TemporadaArchivo } from './reconstruccion.ts';
import { seed } from './seed.ts';

/* -------------------------------------------------------------------------- */
/* Lectura y validación del archivo                                            */
/* -------------------------------------------------------------------------- */

const fecha = z.string().refine((valor) => !Number.isNaN(Date.parse(valor)), 'Fecha no válida.');
const coronas = z.number().int().min(0).max(3);

const partidoArchivo = z
  .object({
    orden: z.number().int().min(1),
    local: z.string().min(1),
    visitante: z.string().min(1),
    resultado: z.object({ local: coronas, visitante: coronas }).optional(),
    nota: z.string().min(3).max(500).optional(),
    walkover: z
      .object({
        ausente: z.string().min(1),
        motivo: z.string().min(3).max(500),
        reprogramadoPara: fecha.optional(),
      })
      .optional(),
  })
  .refine((p) => !(p.resultado !== undefined && p.walkover !== undefined), {
    message: 'Un partido no puede tener a la vez resultado y walkover.',
  });

export const temporadaArchivo = z.object({
  formato: z.literal(1),
  temporada: z.string(),
  aviso: z.string(),
  zonaHoraria: z.string(),
  jugadores: z.array(z.object({ nombre: z.string().min(1), plaza: z.number().int().min(1) })),
  sorteo: z.object({
    semilla: z.string().min(1).max(120),
    intento: z.number().int(),
    criterios: z.array(z.string()),
  }),
  intervaloMinutos: z.number().int().min(0).max(1440),
  notaResultados: z.string().min(3).max(500),
  jornadas: z.array(
    z.object({
      jornada: z.number().int().min(1),
      vuelta: z.number().int().min(1).max(2),
      inicio: fecha.nullable(),
      partidos: z.array(partidoArchivo),
    }),
  ),
  clasificacionEsperada: z.array(
    z.object({
      posicion: z.number().int(),
      jugador: z.string(),
      pj: z.number().int(),
      vg: z.number().int(),
      vp: z.number().int(),
      dc: z.number().int(),
      pts: z.number().int(),
    }),
  ),
});

export function leerTemporada(ruta: string = RUTA_TEMPORADA): TemporadaArchivo {
  const crudo: unknown = JSON.parse(readFileSync(ruta, 'utf8'));
  const leido = temporadaArchivo.safeParse(crudo);
  if (!leido.success) {
    const problemas = leido.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`);
    throw new Error(`El archivo ${ruta} no tiene la forma esperada:\n${problemas.join('\n')}`);
  }
  return leido.data as TemporadaArchivo;
}

/* -------------------------------------------------------------------------- */
/* Restauración                                                                */
/* -------------------------------------------------------------------------- */

export interface RestaurarOptions {
  readonly app: FastifyInstance;
  readonly email: string;
  readonly password: string;
  readonly temporada: TemporadaArchivo;
  /** El reloj con el que se construyó `app`. Se mueve partido a partido. */
  readonly reloj: { current: Date };
  readonly log?: (mensaje: string) => void;
}

export interface RestaurarResult {
  readonly partidos: number;
  readonly resultados: number;
  readonly walkovers: number;
  readonly aplazados: number;
  readonly jornadasConFecha: number;
  readonly clasificacion: readonly FilaClasificacion[];
}

interface FilaClasificacion {
  readonly position: number;
  readonly displayName: string;
  readonly played: number;
  readonly wins: number;
  readonly losses: number;
  readonly crownDiff: number;
  readonly points: number;
}

interface PartidoApi {
  readonly id: string;
  readonly order: number;
  readonly roundNumber: number;
  readonly status: string;
  readonly scheduledAt: string | null;
  readonly home: { readonly id: string; readonly displayName: string };
  readonly away: { readonly id: string; readonly displayName: string };
}

interface Evento {
  readonly cuando: number;
  readonly descripcion: string;
  readonly hacer: () => Promise<void>;
}

const MINUTO = 60_000;

export async function restaurarTemporada(options: RestaurarOptions): Promise<RestaurarResult> {
  const { app, temporada, reloj } = options;
  const log = options.log ?? (() => undefined);
  const relojOriginal = reloj.current;

  const login = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { email: options.email, password: options.password },
  });
  const sesion = login.cookies.find((c) => c.name === 'liga_admin_session');
  if (sesion === undefined) {
    throw new Error(`No se pudo iniciar sesión como administrador (${login.statusCode}).`);
  }
  const cookie = `liga_admin_session=${sesion.value}`;

  const llamar = async (metodo: 'GET' | 'POST', url: string, payload?: object) => {
    const respuesta = await app.inject({
      method: metodo,
      url,
      headers: { cookie },
      ...(payload === undefined ? {} : { payload }),
    });
    if (respuesta.statusCode >= 400) {
      throw new Error(`${metodo} ${url} respondió ${respuesta.statusCode}: ${respuesta.body}`);
    }
    return respuesta.json() as unknown;
  };

  try {
    const inicioJ1 = temporada.jornadas.find((j) => j.jornada === 1)?.inicio;
    // Los preparativos ocurren la víspera de la primera jornada.
    reloj.current = new Date(
      inicioJ1 === null || inicioJ1 === undefined
        ? relojOriginal.getTime()
        : Date.parse(inicioJ1) - 24 * 60 * MINUTO,
    );

    /* 1. Plantilla. */
    const { players } = (await llamar('GET', '/api/v1/admin/players')) as {
      players: { id: string; displayName: string; slot: number | null; status: string }[];
    };
    const idDe = new Map<string, string>();
    for (const { nombre, plaza } of temporada.jugadores) {
      const existente = players.find((p) => p.displayName === nombre);
      if (existente !== undefined) {
        if (existente.slot !== plaza || existente.status !== 'CONFIRMED') {
          throw new Error(
            `${nombre} ya existe en la plaza ${existente.slot} (${existente.status}); el archivo lo pone en la ${plaza}.`,
          );
        }
        idDe.set(nombre, existente.id);
        continue;
      }
      const { id } = (await llamar('POST', '/api/v1/admin/players', {
        displayName: nombre,
      })) as { id: string };
      await llamar('POST', `/api/v1/admin/players/${id}/confirm`, { slot: plaza });
      idDe.set(nombre, id);
      log(`  + ${nombre} (plaza ${plaza})`);
    }

    /* 2. Calendario: el sorteo oficial con la semilla del archivo. */
    await llamar('POST', '/api/v1/admin/tournament/status', { status: 'READY' });
    await llamar('POST', '/api/v1/admin/fixture/generate', { seed: temporada.sorteo.semilla });
    await llamar('POST', '/api/v1/admin/tournament/status', { status: 'LIVE' });

    let partidos = await leerPartidos(llamar);
    comprobarCalendario(temporada, partidos);
    log(`  Calendario: ${partidos.length} partidos, semilla ${temporada.sorteo.semilla}`);

    /* 3. Fechas. */
    let jornadasConFecha = 0;
    for (const jornada of temporada.jornadas) {
      if (jornada.inicio === null) continue;
      await llamar('POST', `/api/v1/admin/rounds/${jornada.jornada}/schedule`, {
        startAt: new Date(jornada.inicio).toISOString(),
        intervalMinutes: temporada.intervaloMinutos,
      });
      jornadasConFecha += 1;
    }
    partidos = await leerPartidos(llamar);

    /* 4. Lo que pasó, en el orden en que pasó. */
    const eventos: Evento[] = [];
    let resultados = 0;
    let walkovers = 0;
    let aplazados = 0;

    for (const jornada of temporada.jornadas) {
      for (const partido of jornada.partidos) {
        const enApi = buscarPartido(partidos, jornada.jornada, partido.local, partido.visitante);
        const hora = Date.parse(enApi.scheduledAt ?? '');
        const etiqueta = `J${jornada.jornada} ${partido.local}-${partido.visitante}`;

        if (partido.resultado !== undefined) {
          const { local, visitante } = partido.resultado;
          exigirFecha(hora, etiqueta);
          resultados += 1;
          eventos.push({
            cuando: hora + 12 * MINUTO,
            descripcion: `${etiqueta} ${local}-${visitante}`,
            hacer: async () => {
              await llamar('POST', `/api/v1/admin/matches/${enApi.id}/result`, {
                homeCrowns: local,
                awayCrowns: visitante,
                notes: partido.nota ?? temporada.notaResultados,
              });
            },
          });
          continue;
        }

        const walkover = partido.walkover;
        if (walkover === undefined) continue;
        exigirFecha(hora, etiqueta);
        const ausente = idDe.get(walkover.ausente);
        if (ausente === undefined) {
          throw new Error(`${etiqueta}: ${walkover.ausente} no está en la plantilla.`);
        }
        walkovers += 1;
        const declarar = async () => {
          await llamar('POST', `/api/v1/admin/matches/${enApi.id}/walkover`, {
            absentPlayerId: ausente,
            reason: walkover.motivo,
          });
        };

        if (walkover.reprogramadoPara === undefined) {
          eventos.push({
            cuando: hora + 16 * MINUTO,
            descripcion: `${etiqueta} walkover (falta ${walkover.ausente})`,
            hacer: declarar,
          });
          continue;
        }

        // Pendiente: se aplazó en su fecha, se reprogramó y no se presentó.
        const nueva = Date.parse(walkover.reprogramadoPara);
        aplazados += 1;
        eventos.push(
          {
            cuando: hora + 16 * MINUTO,
            descripcion: `${etiqueta} aplazado`,
            hacer: async () => {
              await llamar('POST', `/api/v1/admin/matches/${enApi.id}/postpone`, {
                reason: 'OTHER',
                notes: `${walkover.ausente} no jugó en su fecha; queda pendiente. Reconstrucción: motivo original no registrado.`,
              });
            },
          },
          {
            cuando: nueva - 2 * 60 * MINUTO,
            descripcion: `${etiqueta} reprogramado`,
            hacer: async () => {
              await llamar('POST', `/api/v1/admin/matches/${enApi.id}/reschedule`, {
                newScheduledAt: new Date(nueva).toISOString(),
                notes: 'Se reprograma el partido pendiente para cerrar la jornada 7.',
                reason: 'ADMIN_DECISION',
              });
            },
          },
          {
            cuando: nueva + 16 * MINUTO,
            descripcion: `${etiqueta} walkover (falta ${walkover.ausente})`,
            hacer: declarar,
          },
        );
      }
    }

    eventos.sort((a, b) => a.cuando - b.cuando);
    for (const evento of eventos) {
      reloj.current = new Date(evento.cuando);
      await evento.hacer();
    }
    log(`  ${resultados} resultados, ${walkovers} walkovers (${aplazados} tras aplazarse)`);

    /* 5. La comprobación que importa. */
    reloj.current = relojOriginal;
    const { rows } = (await llamar('GET', '/api/v1/standings')) as {
      rows: FilaClasificacion[];
    };
    comprobarClasificacion(temporada, rows);

    return {
      partidos: partidos.length,
      resultados,
      walkovers,
      aplazados,
      jornadasConFecha,
      clasificacion: rows,
    };
  } finally {
    reloj.current = relojOriginal;
  }
}

async function leerPartidos(
  llamar: (metodo: 'GET', url: string) => Promise<unknown>,
): Promise<PartidoApi[]> {
  const fixture = (await llamar('GET', '/api/v1/fixture')) as {
    rounds: { matches: PartidoApi[] }[];
  };
  return fixture.rounds.flatMap((round) => round.matches);
}

function buscarPartido(
  partidos: readonly PartidoApi[],
  jornada: number,
  local: string,
  visitante: string,
): PartidoApi {
  const encontrado = partidos.find(
    (p) =>
      p.roundNumber === jornada && p.home.displayName === local && p.away.displayName === visitante,
  );
  if (encontrado === undefined) {
    throw new Error(`El calendario no tiene ${local}-${visitante} en la jornada ${jornada}.`);
  }
  return encontrado;
}

function exigirFecha(hora: number, etiqueta: string): void {
  if (Number.isNaN(hora)) {
    throw new Error(`${etiqueta} no tiene fecha: hace falta para registrarlo.`);
  }
}

/** El sorteo con la semilla del archivo tiene que dar exactamente su calendario. */
function comprobarCalendario(temporada: TemporadaArchivo, partidos: readonly PartidoApi[]): void {
  const firma = (lista: readonly { j: number; l: string; v: string }[]) =>
    lista
      .map(({ j, l, v }) => `${j}:${l}>${v}`)
      .sort()
      .join(',');
  const esperado = firma(
    temporada.jornadas.flatMap((jornada) =>
      jornada.partidos.map((p) => ({ j: jornada.jornada, l: p.local, v: p.visitante })),
    ),
  );
  const real = firma(
    partidos.map((p) => ({ j: p.roundNumber, l: p.home.displayName, v: p.away.displayName })),
  );
  if (esperado !== real) {
    throw new Error(
      'El sorteo con la semilla del archivo no da su calendario. ¿Cambió el orden de las plazas o el generador?',
    );
  }
}

function comprobarClasificacion(
  temporada: TemporadaArchivo,
  filas: readonly FilaClasificacion[],
): void {
  const diferencias: string[] = [];
  for (const esperada of temporada.clasificacionEsperada) {
    const fila = filas.find((f) => f.displayName === esperada.jugador);
    const real =
      fila === undefined
        ? 'no aparece'
        : `${fila.position}º ${fila.played} ${fila.wins} ${fila.losses} ${fila.crownDiff} ${fila.points}`;
    const debe = `${esperada.posicion}º ${esperada.pj} ${esperada.vg} ${esperada.vp} ${esperada.dc} ${esperada.pts}`;
    if (real !== debe) diferencias.push(`  ${esperada.jugador}: sale ${real}, debía ${debe}`);
  }
  if (diferencias.length > 0) {
    throw new Error(
      `La clasificación restaurada no es la esperada (pos PJ VG VP DC PTS):\n${diferencias.join('\n')}`,
    );
  }
}

/* -------------------------------------------------------------------------- */
/* Línea de comandos                                                           */
/* -------------------------------------------------------------------------- */

async function main(): Promise<void> {
  const config = loadConfig();
  if (config.databaseUrl === null) {
    console.error('Falta DATABASE_URL en .env (por ejemplo, DATABASE_URL=file:./datos/liga).');
    process.exit(78);
  }
  const email = process.env['ADMIN_EMAIL'] ?? 'admin@liga-estabanquitos.local';
  const password = process.env['ADMIN_PASSWORD'] ?? '';
  if (password.length < 12) {
    console.error('Define ADMIN_PASSWORD en .env, con al menos 12 caracteres.');
    process.exit(78);
  }

  const ruta = process.argv[2] === undefined ? RUTA_TEMPORADA : path.resolve(process.argv[2]);
  const temporada = leerTemporada(ruta);

  const local = isLocalDatabaseUrl(config.databaseUrl)
    ? await createLocalDatabase(config.databaseUrl)
    : null;
  const db = local?.db ?? createDatabase({ connectionString: config.databaseUrl });

  try {
    const torneo = await db.query.tournaments.findFirst({
      where: eq(schema.tournaments.slug, config.tournamentSlug),
    });
    if (torneo !== undefined) {
      const jornadas = await db.query.rounds.findMany({
        where: eq(schema.rounds.tournamentId, torneo.id),
        columns: { id: true },
      });
      if (jornadas.length > 0) {
        console.error(
          [
            '',
            '  Esta base ya tiene calendario: no se restaura encima.',
            '',
            local === null
              ? '  Usa una base vacía.'
              : `  Si de verdad quieres empezar de cero, para el servidor, copia y borra\n  la carpeta ${local.dataDir} y vuelve a ejecutar «npm run restaurar».`,
            '',
          ].join('\n'),
        );
        process.exitCode = 1;
        return;
      }
    }

    await seed(db, {
      tournamentSlug: config.tournamentSlug,
      adminEmail: email,
      adminPassword: password,
    });

    const reloj = { current: new Date() };
    const app = await buildServer({ config, db, now: () => reloj.current, silent: true });
    await app.ready();

    try {
      console.log(`\n  Restaurando ${temporada.temporada} desde ${ruta}\n`);
      const resultado = await restaurarTemporada({
        app,
        email,
        password,
        temporada,
        reloj,
        log: (mensaje) => console.log(mensaje),
      });

      console.log('\n  Clasificación (POS JUGADOR PJ VG VP DC PTS):');
      for (const fila of resultado.clasificacion) {
        const dc = fila.crownDiff > 0 ? `+${fila.crownDiff}` : String(fila.crownDiff);
        console.log(
          `   ${String(fila.position).padStart(2)} ${fila.displayName.padEnd(10)} ${fila.played} ${fila.wins} ${fila.losses} ${dc.padStart(3)} ${fila.points}`,
        );
      }
      const fechadas = temporada.jornadas.filter((j) => j.inicio !== null);
      const proximas = fechadas.filter((j) =>
        j.partidos.every((p) => p.resultado === undefined && p.walkover === undefined),
      );
      console.log(
        [
          '',
          '  Restauración completa y comprobada.',
          ...proximas.map((j) => `  J${j.jornada} programada para ${j.inicio}`),
          local === null ? '' : `  Datos en ${local.dataDir}`,
          '',
        ].join('\n'),
      );
    } finally {
      await app.close();
    }
  } finally {
    await local?.close();
  }
}

if (process.argv[1] !== undefined && import.meta.filename === process.argv[1]) {
  // Salida explícita: con PostgreSQL nativo el pool de conexiones mantendría
  // vivo el proceso después de terminar.
  main().then(
    () => process.exit(process.exitCode ?? 0),
    (error: unknown) => {
      if (error instanceof ConfigError) {
        console.error(error.message);
        process.exit(78);
      }
      console.error(error instanceof Error ? `\n  ${error.message}\n` : error);
      process.exit(1);
    },
  );
}
