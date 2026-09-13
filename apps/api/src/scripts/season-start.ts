/**
 * Temporada lista para empezar.
 *
 * Es el estado con el que se publica una liga: calendario generado, las primeras
 * jornadas con fecha, la competicion abierta y **ningun resultado**. Nadie ha
 * jugado nada todavia, y la pagina no finge lo contrario.
 *
 * Se separa a proposito de `demo-scenario`, que si inventa partidos jugados
 * porque las pruebas de extremo a extremo necesitan algo que mirar. Mezclar los
 * dos acabaria enseñando resultados de mentira en una liga real, que es
 * exactamente lo que no puede pasar.
 *
 * Como el escenario de demostracion, todo se hace llamando a la API con sesion
 * de administrador: no se escribe una fila a mano, asi que no se puede llegar a
 * un estado que la competicion no permita.
 */

import type { FastifyInstance } from 'fastify';

export interface SeasonStartOptions {
  readonly app: FastifyInstance;
  readonly email: string;
  readonly password: string;
  /** Semilla del sorteo. Fija, para que el calendario sea reproducible. */
  readonly seed?: string;
  /** Cuando se juega la primera jornada. Por defecto, el proximo sabado. */
  readonly firstRoundAt?: Date;
  /** Cuantas jornadas se dejan con fecha puesta. */
  readonly scheduledRounds?: number;
}

export interface SeasonStartResult {
  readonly matches: number;
  readonly rounds: number;
  readonly scheduled: number;
}

/** El proximo sabado a las 20:00, que es cuando se juega esta liga. */
function nextSaturday(from: Date): Date {
  const date = new Date(from);
  date.setHours(20, 0, 0, 0);
  const daysUntilSaturday = (6 - date.getDay() + 7) % 7 || 7;
  date.setDate(date.getDate() + daysUntilSaturday);
  return date;
}

export async function applySeasonStart(options: SeasonStartOptions): Promise<SeasonStartResult> {
  const { app } = options;

  const login = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { email: options.email, password: options.password },
  });
  const session = login.cookies.find((entry) => entry.name === 'liga_admin_session');
  if (session === undefined)
    throw new Error('No se pudo iniciar sesion para preparar la temporada.');
  const cookie = `liga_admin_session=${session.value}`;

  const post = async (url: string, payload: object = {}) =>
    await app.inject({ method: 'POST', url, headers: { cookie }, payload });

  await post('/api/v1/admin/tournament/status', { status: 'READY' });
  await post('/api/v1/admin/fixture/generate', {
    seed: options.seed ?? 'liga-estabanquitos-2026-1',
  });
  await post('/api/v1/admin/tournament/status', { status: 'LIVE' });

  /*
    Se fechan las primeras jornadas y no todas: una liga real acuerda los
    horarios sobre la marcha, y poner dieciocho fechas inventadas seria afirmar
    algo que nadie ha acordado.
  */
  const howMany = options.scheduledRounds ?? 3;
  const first = options.firstRoundAt ?? nextSaturday(new Date());
  let scheduled = 0;

  for (let round = 1; round <= howMany; round += 1) {
    const startAt = new Date(first.getTime() + (round - 1) * 7 * 24 * 60 * 60 * 1000);
    const response = await post(`/api/v1/admin/rounds/${round}/schedule`, {
      startAt: startAt.toISOString(),
      intervalMinutes: 30,
    });
    if (response.statusCode === 200)
      scheduled += (response.json() as { scheduled: number }).scheduled;
  }

  const fixture = (await app.inject({ method: 'GET', url: '/api/v1/fixture' })).json() as {
    rounds: { matches: unknown[] }[];
  };

  return {
    rounds: fixture.rounds.length,
    matches: fixture.rounds.reduce((sum, round) => sum + round.matches.length, 0),
    scheduled,
  };
}
