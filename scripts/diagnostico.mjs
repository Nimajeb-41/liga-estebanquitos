/**
 * Diagnóstico antes de una jornada.
 *
 * Comprueba lo que tiene que estar funcionando para poder operar: la base de
 * datos, el administrador, la API de Supercell, el canal de Kick y el estado
 * del torneo. Dice qué falla y **qué hacer**, no solo que falla.
 *
 * Está pensado para ejecutarse cinco minutos antes de empezar:
 *
 *     npm run diagnostico
 *
 * No modifica nada. Solo lee.
 *
 * Nunca imprime el token ni la contraseña: de los secretos solo se dice si
 * están puestos y si funcionan.
 */

import fs from 'node:fs';
import path from 'node:path';

const API = process.env['API_URL'] ?? 'http://127.0.0.1:3000';

let fallos = 0;
let avisos = 0;

function ok(titulo, detalle = '') {
  console.log(`  \x1b[32mOK\x1b[0m    ${titulo}${detalle ? ` · ${detalle}` : ''}`);
}

function aviso(titulo, queHacer) {
  avisos += 1;
  console.log(`  \x1b[33mAVISO\x1b[0m ${titulo}`);
  if (queHacer) console.log(`        ${queHacer}`);
}

function fallo(titulo, queHacer) {
  fallos += 1;
  console.log(`  \x1b[31mFALLO\x1b[0m ${titulo}`);
  if (queHacer) console.log(`        ${queHacer}`);
}

function seccion(titulo) {
  console.log(`\n${titulo}`);
}

/** Lee `.env` sin exponer valores. */
function leerEnv() {
  const archivo = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(archivo)) return null;
  return Object.fromEntries(
    fs
      .readFileSync(archivo, 'utf8')
      .split('\n')
      .filter((linea) => linea.trim() && !linea.startsWith('#') && linea.includes('='))
      .map((linea) => [
        linea.slice(0, linea.indexOf('=')).trim(),
        linea.slice(linea.indexOf('=') + 1).trim(),
      ]),
  );
}

async function ipPublica() {
  try {
    const res = await fetch('https://api.ipify.org', { signal: AbortSignal.timeout(6000) });
    return res.ok ? (await res.text()).trim() : null;
  } catch {
    return null;
  }
}

async function main() {
  console.log('\nDiagnóstico de la Liga Estabanquitos\n' + '='.repeat(38));

  /* ---------------------------------------------------------------- */
  seccion('Configuración');

  const env = leerEnv();
  if (env === null) {
    fallo('No hay archivo .env', 'Copia .env.example a .env y rellénalo.');
    process.exit(1);
  }

  for (const clave of ['DATABASE_URL', 'ADMIN_EMAIL', 'ADMIN_PASSWORD']) {
    const valor = env[clave] ?? '';
    if (valor === '') fallo(`${clave} está vacío`, 'Sin esto el servidor no arranca.');
  }
  if ((env['ADMIN_PASSWORD'] ?? '').length > 0 && env['ADMIN_PASSWORD'].length < 12) {
    fallo('ADMIN_PASSWORD tiene menos de 12 caracteres', 'El seed la rechaza.');
  }
  if (fallos === 0) ok('.env completo', `administrador: ${env['ADMIN_EMAIL']}`);

  const local = (env['DATABASE_URL'] ?? '').startsWith('file:');
  ok('Base de datos', local ? 'local, en carpeta' : 'servidor PostgreSQL');

  /* ---------------------------------------------------------------- */
  seccion('Servidor');

  let salud;
  try {
    const res = await fetch(`${API}/health`, { signal: AbortSignal.timeout(5000) });
    salud = await res.json();
    ok('La API responde', `${salud.environment} · en pie desde hace ${salud.uptimeSeconds}s`);
  } catch {
    fallo('La API no responde', `Arráncala con "npm run liga" (se esperaba en ${API}).`);
    console.log('\nSin servidor no se puede comprobar nada más.\n');
    process.exit(1);
  }

  /* ---------------------------------------------------------------- */
  seccion('Administrador');

  let cookie = null;
  try {
    const res = await fetch(`${API}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: env['ADMIN_EMAIL'], password: env['ADMIN_PASSWORD'] }),
      signal: AbortSignal.timeout(8000),
    });
    if (res.status === 200) {
      cookie = res.headers
        .getSetCookie()
        .find((c) => c.startsWith('liga_admin_session'))
        ?.split(';')[0];
      ok('Puedes entrar al panel', env['ADMIN_EMAIL']);
    } else {
      fallo(
        `El acceso falla (${res.status})`,
        'Comprueba ADMIN_EMAIL y ADMIN_PASSWORD, y que la base esté sembrada ("npm run seed").',
      );
    }
  } catch {
    fallo('No se pudo probar el acceso', 'La API respondió a /health pero no al login.');
  }

  /* ---------------------------------------------------------------- */
  seccion('Clash Royale (API oficial de Supercell)');

  if (salud.clashRoyale !== 'enabled') {
    aviso(
      'La integración está apagada',
      'Pon CLASH_ROYALE_ENABLED=true y un token en CLASH_ROYALE_API_TOKEN.',
    );
  } else if (cookie === null) {
    aviso('No se pudo comprobar: hace falta sesión de administrador', '');
  } else {
    const res = await fetch(`${API}/api/v1/admin/clash-royale/cards/sync`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: '{}',
      signal: AbortSignal.timeout(20000),
    });
    const cuerpo = await res.json().catch(() => ({}));

    if (res.status === 200) {
      ok('Supercell responde', `${cuerpo.total} cartas en el catálogo`);
    } else if (cuerpo.error?.details?.reason === 'accessDenied.invalidIp') {
      const ip = await ipPublica();
      fallo(
        'Supercell rechaza el token: la IP no coincide',
        `Tu IP pública ahora es ${ip ?? '(no se pudo consultar)'}.\n` +
          '        El portal NO deja editar la IP de una llave: hay que borrarla y crear otra.\n' +
          '        1) developer.clashroyale.com -> borra la llave\n' +
          `        2) crea una nueva con la IP ${ip ?? 'actual'}\n` +
          '        3) pon el token nuevo en CLASH_ROYALE_API_TOKEN\n' +
          '        4) reinicia con "npm run liga" y vuelve a pasar este diagnóstico',
      );
    } else {
      aviso(
        `Supercell respondió ${res.status} (${cuerpo.error?.code ?? 'sin código'})`,
        'La liga se puede operar igual: los resultados se registran a mano.',
      );
    }
  }

  /* ---------------------------------------------------------------- */
  seccion('Retransmisión (Kick)');

  try {
    const res = await fetch(`${API}/api/v1/broadcast`, { signal: AbortSignal.timeout(12000) });
    const emision = await res.json();
    const canal = emision.channel;

    if (emision.reason === 'NOT_CONFIGURED') {
      aviso('La comprobación del directo está apagada', 'Pon BROADCAST_CHECK_ENABLED=true.');
    } else if (canal.state === 'UNKNOWN') {
      aviso(
        'No se pudo comprobar el canal',
        'Kick no respondió o cambió su respuesta. El aviso de directo no aparecerá, que es lo correcto.',
      );
    } else if (canal.state === 'OFFLINE') {
      ok('Kick responde', `${canal.name} no está emitiendo ahora`);
    } else {
      ok(
        'Kick responde',
        `${canal.name} EN DIRECTO${canal.category ? ` · ${canal.category}` : ''}` +
          (canal.playingClashRoyale ? '' : ' (no es Clash Royale)'),
      );
    }
  } catch {
    aviso('No se pudo consultar el estado del directo', 'No afecta a registrar resultados.');
  }

  /* ---------------------------------------------------------------- */
  seccion('Torneo');

  const torneo = await (await fetch(`${API}/api/v1/tournament`)).json();
  ok('Estado', torneo.status);
  ok('Plantilla', `${torneo.roster.confirmed}/${torneo.roster.rosterSize} confirmados`);

  if (!torneo.fixture.generated) {
    aviso('No hay calendario generado', 'Genéralo en /admin/fixtures.');
  } else {
    ok('Calendario', `${torneo.fixture.matches} partidos`);

    const partidos = await (await fetch(`${API}/api/v1/matches`)).json();
    const sinFecha = partidos.filter((m) => m.scheduledAt === null).length;
    if (sinFecha > 0) {
      aviso(`${sinFecha} partidos sin fecha`, 'Prográmalos en /admin/jornadas.');
    } else {
      ok('Fechas', 'todos los partidos programados');
    }

    const ahora = Date.now();
    const proximo = partidos
      .filter((m) => m.status === 'SCHEDULED' && m.scheduledAt !== null)
      .filter((m) => Date.parse(m.scheduledAt) > ahora)
      .sort((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt))[0];
    if (proximo !== undefined) {
      ok(
        'Próximo partido',
        `${proximo.home.displayName} vs ${proximo.away.displayName} · ` +
          new Date(proximo.scheduledAt).toLocaleString('es-UY', {
            weekday: 'long',
            day: '2-digit',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
          }),
      );
    }
  }

  if (cookie !== null) {
    const atencion = await (
      await fetch(`${API}/api/v1/admin/attention`, { headers: { cookie } })
    ).json();
    const candidatos = atencion.byKind?.CANDIDATE_PENDING ?? 0;
    if (candidatos > 0) {
      aviso(
        `${candidatos} candidatos de Clash Royale sin revisar`,
        'Revísalos en /admin/clash-royale. Ninguno se confirma solo.',
      );
    }
  }

  /* ---------------------------------------------------------------- */
  console.log('\n' + '='.repeat(38));
  if (fallos === 0 && avisos === 0) {
    console.log('\x1b[32mTodo listo.\x1b[0m\n');
  } else {
    console.log(`${fallos} fallo(s), ${avisos} aviso(s).`);
    console.log(
      fallos === 0
        ? 'Nada bloquea la jornada: los avisos son cosas que conviene mirar.\n'
        : 'Los fallos hay que resolverlos antes de empezar.\n',
    );
  }

  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('\nEl diagnóstico se rompió:', error.message);
  process.exit(1);
});
