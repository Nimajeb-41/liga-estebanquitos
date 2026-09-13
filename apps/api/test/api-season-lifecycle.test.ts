/**
 * Ciclo de vida de la temporada y su cierre.
 *
 * Un solo PostgreSQL para los dos escenarios. Cada instancia de PGlite es un
 * PostgreSQL en WebAssembly, y levantar uno por escenario tumbaba al trabajador
 * de vitest. Ademas el cierre que prueba el ciclo de vida es exactamente el que
 * genera la instantanea, asi que encadenarlos no pierde cobertura: la prueba
 * la segunda mitad sobre el documento que produjo la primera.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { asAdmin, createTestApp, type TestApp } from './helpers.ts';
/* ========================================================================== */
/* Ciclo de vida de temporada y cierre (Fase 5.1)                              */
/* ========================================================================== */

/**
 * La maquina de estados del torneo, por HTTP.
 *
 * Lo que se prueba no son las transiciones felices —eso ya lo cubre el
 * dominio— sino los tres sitios donde un estado podria mentir: decir que la
 * temporada esta calendarizada sin calendario, dejar registrar resultados en
 * una temporada cancelada, y cerrar una temporada a medias sin que nadie lo
 * haya dicho expresamente.
 */
let harness: TestApp;

beforeAll(async () => {
  harness = await createTestApp({ withTestPlayers: true });
}, 120_000);

afterAll(async () => {
  await harness.close();
});

describe('ciclo de vida de la temporada', () => {
  const admin = () => asAdmin(harness);
  const overview = async () =>
    (await harness.app.inject({ method: 'GET', url: '/api/v1/tournament' })).json();
  const setStatus = (status: string) => admin().post('/api/v1/admin/tournament/status', { status });

  it('arranca en REGISTRATION y publica a donde puede ir', async () => {
    const body = await overview();

    expect(body.status).toBe('REGISTRATION');
    expect(body.allowedTransitions).toContain('READY');
    expect(body.allowedTransitions).toContain('CANCELLED');
    // La interfaz ofrece exactamente esto: no deduce transiciones por su cuenta.
    expect(body.allowedTransitions).not.toContain('LIVE');
  });

  it('rechaza un salto arbitrario', async () => {
    const response = await setStatus('LIVE');

    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('INVALID_STATUS_TRANSITION');
    expect((await overview()).status).toBe('REGISTRATION');
  });

  it('no calendariza una temporada sin calendario', async () => {
    expect((await setStatus('READY')).statusCode).toBe(200);

    // READY -> SCHEDULED es una transicion valida del dominio, pero el estado
    // significa «el calendario oficial existe», y todavia no existe.
    const response = await setStatus('SCHEDULED');
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('FIXTURE_NOT_GENERATED');
  });

  it('generar el calendario es lo que deja la temporada calendarizada', () => {
    // No hace falta cambiar el estado a mano: generar el calendario oficial
    // **es** el hecho que convierte la temporada en SCHEDULED. Un paso manual
    // aparte solo permitiria que los dos se separaran.
    return admin()
      .post('/api/v1/admin/fixture/generate', { seed: 'ciclo-de-vida' })
      .then(async (generated) => {
        expect(generated.statusCode).toBe(200);
        expect(generated.json()).toMatchObject({ rounds: 18, matches: 90 });

        const body = await overview();
        expect(body.status).toBe('SCHEDULED');
        expect(body.fixture.generated).toBe(true);
        expect(body.fixture.seed).toBe('ciclo-de-vida');
      });
  });

  it('y queda auditado con responsable y peticion', async () => {
    const entries = (await admin().get('/api/v1/admin/audit?action=FIXTURE_GENERATED')).json();

    expect(entries).toHaveLength(1);
    expect(entries[0].actor).toBe('Administrador');
    expect(entries[0].requestId).not.toBeNull();
  });

  it('no se genera un segundo calendario por accidente', async () => {
    const again = await admin().post('/api/v1/admin/fixture/generate', { seed: 'otro' });

    expect(again.statusCode).toBe(409);
    expect(again.json().error.code).toBe('FIXTURE_ALREADY_EXISTS');
  });
  it('cerrar la temporada no se hace desde el selector de estado', async () => {
    expect((await setStatus('LIVE')).statusCode).toBe(200);

    const response = await setStatus('FINISHED');
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('USE_SEASON_FINALIZATION');
    // Y dice por donde: el mensaje tiene que servir para algo.
    expect(response.json().error.details.endpoint).toContain('/tournament/finish');
  });

  it('el informe de cierre enumera lo que falta, con partidos concretos', async () => {
    const report = (await admin().get('/api/v1/admin/tournament/closure')).json();

    expect(report.closeable).toBe(false);
    const pending = report.blockers.find(
      (entry: { code: string }) => entry.code === 'MATCHES_NOT_PLAYED',
    );
    expect(pending.count).toBe(90);
    expect(pending.matchIds).toHaveLength(90);
  });

  it('no cierra una temporada a medias sin decirlo expresamente', async () => {
    const response = await admin().post('/api/v1/admin/tournament/finish', {
      reason: 'Se acabo',
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('SEASON_NOT_CLOSEABLE');
    // Devuelve el informe: quien lo lea sabe exactamente que resolver.
    expect(response.json().error.details.report.blockers.length).toBeGreaterThan(0);
    expect((await overview()).status).toBe('LIVE');
  });

  it('exige un motivo por escrito', async () => {
    const response = await admin().post('/api/v1/admin/tournament/finish', {
      reason: '',
      acknowledgePending: true,
    });
    expect(response.statusCode).toBe(400);
  });

  it('cierra reconociendo lo pendiente, y deja constancia de ello', async () => {
    const response = await admin().post('/api/v1/admin/tournament/finish', {
      reason: 'La liga se interrumpe por acuerdo de los participantes.',
      acknowledgePending: true,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.status).toBe('FINISHED');
    expect(body.snapshotId).toBeTypeOf('string');
    expect(body.report.closeable).toBe(false);

    expect((await overview()).status).toBe('FINISHED');
    expect((await overview()).finishedAt).not.toBeNull();

    const entries = (await admin().get('/api/v1/admin/audit?action=SEASON_FINISHED')).json();
    expect(entries[0].payload.closedWithPending).toBe(true);
    expect(entries[0].payload.reason).toContain('acuerdo');
    expect(entries[0].payload.blockers.length).toBeGreaterThan(0);
  });

  it('FINISHED es terminal: no se sale ni se registra nada', async () => {
    expect((await overview()).allowedTransitions).toEqual([]);
    expect((await overview()).capabilities).toEqual([]);

    for (const status of ['LIVE', 'SCHEDULED', 'DRAFT', 'CANCELLED']) {
      const response = await setStatus(status);
      expect(response.statusCode).toBe(409);
    }

    // Y ninguna operacion de competicion pasa.
    const rounds = (await harness.app.inject({ method: 'GET', url: '/api/v1/fixture' })).json()
      .rounds;
    const match = rounds[0].matches[0];
    const result = await admin().post(`/api/v1/admin/matches/${match.id}/result`, {
      homeCrowns: 3,
      awayCrowns: 1,
    });
    expect(result.statusCode).toBe(409);
    expect(result.json().error.code).toBe('OPERATION_NOT_ALLOWED_IN_STATUS');
  });

  it('no se cierra dos veces', async () => {
    const response = await admin().post('/api/v1/admin/tournament/finish', {
      reason: 'Otra vez',
      acknowledgePending: true,
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('INVALID_STATUS_TRANSITION');
  });
});

/* ========================================================================== */
/* Instantanea final                                                           */
/* ========================================================================== */

/**
 * La instantanea de cierre.
 *
 * Existe porque la clasificacion **se deriva**: cambiar la puntuacion para la
 * temporada siguiente cambiaria la tabla final de esta. Lo que se prueba es
 * que el documento baste para reconstruirla, y que no lleve nada del servidor.
 */
describe('instantanea de cierre', () => {
  const admin = () => asAdmin(harness);

  /** La que genero el cierre del escenario de arriba. */
  let snapshotId: string;

  beforeAll(async () => {
    const list = (await admin().get('/api/v1/admin/tournament/snapshots')).json();
    snapshotId = list[0].id;
  });

  it('se lista con quien la cerro y por que', async () => {
    const list = (await admin().get('/api/v1/admin/tournament/snapshots')).json();

    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(snapshotId);
    expect(list[0].closedBy).toBe('Administrador');
    expect(list[0].reason).toContain('acuerdo');
    expect(list[0].closedWithPending).toBe(true);
    expect(list[0].rulesVersion).toBe('2026-1.2');
  });

  it('contiene lo necesario para reconstruir la temporada', async () => {
    const snapshot = (await admin().get(`/api/v1/admin/tournament/snapshots/${snapshotId}`)).json();

    expect(snapshot.format).toBe('1.0');
    expect(snapshot.season.slug).toBe('liga-estabanquitos-2026-1');
    // Con que reglas se calculo: sin esto la tabla no se explica sola.
    expect(snapshot.rules.version).toBe('2026-1.2');
    expect(snapshot.rules.settings.scoring.win).toBe(3);
    expect(snapshot.rules.settings.scoring.walkoverWin).toBe(3);
    expect(snapshot.participants).toHaveLength(10);
    expect(snapshot.matches).toHaveLength(90);
    expect(snapshot.standings.rows.length).toBeGreaterThan(0);
    expect(snapshot.statistics.players.length).toBeGreaterThan(0);
    expect(snapshot.fixture.seed).toBe('ciclo-de-vida');
    expect(snapshot.audit.length).toBeGreaterThan(0);
  });

  it('separa lo oficial de lo observado', async () => {
    const snapshot = (await admin().get(`/api/v1/admin/tournament/snapshots/${snapshotId}`)).json();

    expect(snapshot.standings.source).toBe('OFFICIAL');
    expect(snapshot.statistics.source).toBe('OFFICIAL');
    expect(snapshot.externalEvidence.source).toBe('OBSERVED');
    // Y lo dice con palabras, no solo con una etiqueta.
    expect(snapshot.externalEvidence.note).toContain('no resultado oficial');
  });

  it('guarda por que se cerro y que quedaba pendiente', async () => {
    const snapshot = (await admin().get(`/api/v1/admin/tournament/snapshots/${snapshotId}`)).json();

    expect(snapshot.closure.closeable).toBe(false);
    expect(snapshot.closure.blockers.length).toBeGreaterThan(0);
    expect(snapshot.closure.closedBy).toBe('Administrador');
    expect(snapshot.closure.requestId).not.toBeNull();
  });

  it('no lleva nada del servidor', async () => {
    const response = await admin().get(`/api/v1/admin/tournament/snapshots/${snapshotId}`);

    // Es una foto de la competicion, no del servidor.
    expect(response.body).not.toContain('Bearer');
    expect(response.body.toLowerCase()).not.toContain('token');
    expect(response.body.toLowerCase()).not.toContain('password');
    expect(response.body.toLowerCase()).not.toContain('tokenhash');
    expect(response.body).not.toContain('DATABASE_URL');
  });

  it('exige sesion', async () => {
    const response = await harness.app.inject({
      method: 'GET',
      url: '/api/v1/admin/tournament/snapshots',
    });
    expect(response.statusCode).toBe(401);
  });
});

let config: TestApp;

beforeAll(async () => {
  config = await createTestApp({ withTestPlayers: true });
}, 120_000);

afterAll(async () => {
  await config.close();
});

/* ========================================================================== */
/* Configuracion de la temporada (Fase 5.2)                                    */
/* ========================================================================== */

/**
 * Lo que un administrador puede ajustar sin tocar codigo.
 *
 * La parte delicada no es guardar numeros: es que cambiar la puntuacion
 * **reescribe la tabla hacia atras**, incluidas las jornadas ya jugadas. Lo que
 * se prueba aqui es que eso quede dicho —sube la version del reglamento— y que
 * lo que no se puede cambiar, no se pueda.
 */
describe('configuracion de la temporada', () => {
  const admin = () => asAdmin(config);
  const rules = async () =>
    (await config.app.inject({ method: 'GET', url: '/api/v1/rules' })).json();
  const overview = async () =>
    (await config.app.inject({ method: 'GET', url: '/api/v1/tournament' })).json();

  it('el reglamento publico dice que parametros son configurables', async () => {
    const body = await rules();

    // Un lector tiene derecho a saber que la puntuacion es decision de esta
    // temporada y no una ley del juego.
    const keys = body.configurable.map((entry: { key: string }) => entry.key);
    expect(keys).toContain('scoring');
    expect(keys).toContain('disputes');
    expect(keys).toContain('rosterSize');

    const scoring = body.configurable.find((entry: { key: string }) => entry.key === 'scoring');
    expect(scoring.group).toBe('SCORING');
    expect(scoring.label).toBeTypeOf('string');
  });

  it('el panel sabe que puede cambiar ahora y con que consecuencia', async () => {
    const body = (await admin().get('/api/v1/admin/tournament/settings')).json();

    const scoring = body.parameters.find((entry: { key: string }) => entry.key === 'scoring');
    expect(scoring.editable).toBe(true);
    // Se avisa **antes** de que nadie pulse nada.
    expect(scoring.recalculatesStandings).toBe(true);

    const disputes = body.parameters.find((entry: { key: string }) => entry.key === 'disputes');
    expect(disputes.recalculatesStandings).toBe(false);
  });

  it('cambia la identidad y las fechas previstas', async () => {
    const response = await admin().patch('/api/v1/admin/tournament', {
      name: 'Liga Estabanquitos',
      plannedStartAt: '2026-10-01T20:00:00.000Z',
      plannedEndAt: '2026-12-20T20:00:00.000Z',
    });

    expect(response.statusCode).toBe(200);
    const body = await overview();
    expect(body.name).toBe('Liga Estabanquitos');
    expect(body.plannedStartAt).toBe('2026-10-01T20:00:00.000Z');
    // Son planes: `startedAt` sigue siendo cuando empezo de verdad.
    expect(body.startedAt).toBeNull();
  });

  it('rechaza una temporada que termina antes de empezar', async () => {
    const response = await admin().patch('/api/v1/admin/tournament', {
      plannedEndAt: '2026-09-01T20:00:00.000Z',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('INVALID_DATE_RANGE');
  });

  it('exige un motivo para cambiar el reglamento', async () => {
    const response = await admin().patch('/api/v1/admin/tournament/settings', {
      disputes: { windowHours: 48 },
    });
    expect(response.statusCode).toBe(400);
  });

  it('no acepta una peticion sin ningun cambio', async () => {
    const response = await admin().patch('/api/v1/admin/tournament/settings', {
      reason: 'Por probar',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('NOTHING_TO_UPDATE');
  });

  it('cambiar un plazo no toca la version del reglamento', async () => {
    const before = (await rules()).rulesVersion;

    const response = await admin().patch('/api/v1/admin/tournament/settings', {
      disputes: { windowHours: 48 },
      reason: 'Se amplia el plazo de impugnacion a dos dias.',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().recalculatesStandings).toBe(false);
    expect((await rules()).disputes.windowHours).toBe(48);
    // No recalcula nada de lo jugado, asi que la version se queda igual.
    expect((await rules()).rulesVersion).toBe(before);
  });

  it('cambiar la puntuacion sube la version del reglamento', async () => {
    const before = (await rules()).rulesVersion;

    const response = await admin().patch('/api/v1/admin/tournament/settings', {
      scoring: { win: 4 },
      reason: 'Ajuste acordado antes de empezar.',
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.recalculatesStandings).toBe(true);
    expect(body.rulesVersion.from).toBe(before);
    expect(body.rulesVersion.to).not.toBe(before);

    // Y la clasificacion publica lleva la nueva: es lo que permite decir con
    // que reglas se calculo lo que se esta viendo.
    const standings = (await config.app.inject({ method: 'GET', url: '/api/v1/standings' })).json();
    expect(standings.rulesVersion).toBe(body.rulesVersion.to);
  });

  it('deja el antes y el despues en auditoria', async () => {
    const entries = (await admin().get('/api/v1/admin/audit?action=SETTINGS_UPDATED')).json();
    const last = entries[0];

    expect(last.payload.reason).toBeTypeOf('string');
    expect(last.payload.before.scoring.win).toBe(3);
    expect(last.payload.after.scoring.win).toBe(4);
    expect(last.payload.rulesVersion.from).not.toBe(last.payload.rulesVersion.to);
    expect(last.actor).toBe('Administrador');
    expect(last.requestId).not.toBeNull();
  });

  it('rechaza una configuracion imposible antes de guardarla', async () => {
    const before = (await rules()).sanctions;

    const response = await admin().patch('/api/v1/admin/tournament/settings', {
      // Una sancion positiva no es una sancion.
      sanctions: { defaultPoints: 5 },
      reason: 'Error de tecleo',
    });
    expect(response.statusCode).toBe(400);

    // Y no ha tocado nada: una configuracion a medias es peor que un error.
    expect((await rules()).sanctions).toEqual(before);
  });

  it('rechaza un numero impar de participantes', async () => {
    const response = await admin().patch('/api/v1/admin/tournament/settings', {
      rosterSize: 9,
      reason: 'Prueba',
    });

    // El generador de calendario no usa descansos: con impares no cuadra.
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('INVALID_SETTINGS');
  });

  it('rechaza un criterio de desempate que no existe', async () => {
    const response = await admin().patch('/api/v1/admin/tournament/settings', {
      tiebreakers: ['POINTS', 'SUERTE'],
      reason: 'Prueba',
    });

    expect(response.statusCode).toBe(400);
  });

  it('con el calendario generado, el formato queda fijado', async () => {
    await admin().post('/api/v1/admin/tournament/status', { status: 'READY' });
    await admin().post('/api/v1/admin/fixture/generate', { seed: 'configuracion' });

    const response = await admin().patch('/api/v1/admin/tournament/settings', {
      rosterSize: 12,
      reason: 'Ampliar la liga',
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('SETTINGS_LOCKED_BY_FIXTURE');
    expect(response.json().error.details.blocked).toEqual(['rosterSize']);
  });

  it('y el panel lo refleja sin tener que intentarlo', async () => {
    const body = (await admin().get('/api/v1/admin/tournament/settings')).json();
    const roster = body.parameters.find((entry: { key: string }) => entry.key === 'rosterSize');

    expect(roster.editable).toBe(false);
    expect(roster.lockedReason).toContain('calendario');
  });

  it('la puntuacion se sigue pudiendo corregir con la liga en marcha', async () => {
    const response = await admin().patch('/api/v1/admin/tournament/settings', {
      scoring: { win: 3 },
      reason: 'Se revierte el ajuste anterior.',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().recalculatesStandings).toBe(true);
  });

  it('todo esto exige sesion', async () => {
    for (const [method, url] of [
      ['PATCH', '/api/v1/admin/tournament'],
      ['PATCH', '/api/v1/admin/tournament/settings'],
      ['GET', '/api/v1/admin/tournament/settings'],
    ] as const) {
      const response = await config.app.inject({ method, url, payload: {} });
      expect(response.statusCode).toBe(401);
    }
  });
});
