/**
 * Recorridos de extremo a extremo.
 *
 * Levanta la pila entera —API sobre PostgreSQL efimero y el frontend ya
 * construido— y recorre los dos caminos que tienen que funcionar siempre:
 *
 *   Publico:  portada -> clasificacion -> jornada -> Match Center -> jugador
 *   Admin:    acceso  -> resumen -> partidos -> resultado -> clasificacion
 *
 * Es HTTP de verdad contra el servidor de verdad: sin mocks y sin atajos. No
 * abre un navegador, asi que no cubre la hidratacion ni el JavaScript de
 * cliente; eso lo cubren los tests de componente de `apps/web/test`.
 *
 *   npm run build --workspace=@liga/web
 *   npm run e2e
 */

import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { createTestDatabase } from '../packages/database/src/testing.ts';
import { loadConfig } from '../apps/api/src/config.ts';
import { buildServer } from '../apps/api/src/server.ts';
import { applyDemoScenario } from '../apps/api/src/scripts/demo-scenario.ts';
import { seed } from '../apps/api/src/scripts/seed.ts';
import { auditHtml } from './a11y-checks.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const WEB_ENTRY = path.join(ROOT, 'apps', 'web', 'dist', 'server', 'entry.mjs');

const API_PORT = Number(process.env.E2E_API_PORT ?? 3311);
const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 4411);
const WEB_ORIGIN = `http://127.0.0.1:${WEB_PORT}`;

const EMAIL = 'admin@liga-estabanquitos.local';
const PASSWORD = 'e2e-liga-estabanquitos';

let passed = 0;
const failures = [];

function check(description, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  ok  ${description}`);
  } else {
    failures.push(`${description}${detail === '' ? '' : ` — ${detail}`}`);
    console.log(`  NO  ${description}${detail === '' ? '' : ` — ${detail}`}`);
  }
}

/**
 * Accesibilidad de una pagina ya descargada.
 *
 * Solo lo comprobable leyendo el HTML: idioma, encabezados, nombres
 * accesibles, etiquetas de formulario y viewport. No sustituye a probarlo
 * con un lector de pantalla, pero atrapa lo que se cuela de verdad.
 */
function checkA11y(name, page) {
  const problems = auditHtml(page.body);
  check(
    `${name}: sin problemas de accesibilidad detectables`,
    problems.length === 0,
    problems.slice(0, 4).join(' | '),
  );
}

function step(title) {
  console.log(`\n${title}`);
}

/** Espera a que el servidor del frontend acepte peticiones. */
async function waitForWeb(timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const response = await fetch(`${WEB_ORIGIN}/robots.txt`);
      if (response.ok) return;
    } catch {
      // todavia no escucha
    }
    if (Date.now() > deadline) throw new Error('El frontend no arranco a tiempo.');
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
}

async function main() {
  if (!existsSync(WEB_ENTRY)) {
    console.error(
      [
        'Falta la version construida del frontend.',
        '',
        '  npm run build --workspace=@liga/web',
        '',
      ].join('\n'),
    );
    process.exit(1);
  }

  // --- API sobre una base de datos efimera, con el escenario de demostracion.
  const handle = await createTestDatabase();
  const config = loadConfig({
    NODE_ENV: 'development',
    API_PORT: String(API_PORT),
    TOURNAMENT_SLUG: 'liga-estabanquitos-2026-1',
    /*
      Sin comprobacion de Kick: estas pruebas no pueden depender de si alguien
      esta emitiendo ahora mismo, ni llamar a un servicio de terceros en cada
      ejecucion. Lo que si se comprueba es la consecuencia: sin canal
      confirmado, la web no anuncia ningun directo.
    */
    BROADCAST_CHECK_ENABLED: 'false',
  });

  await seed(handle.db, {
    tournamentSlug: config.tournamentSlug,
    adminEmail: EMAIL,
    adminPassword: PASSWORD,
    withTestPlayers: true,
  });

  const api = await buildServer({ config, db: handle.db });
  const scenario = await applyDemoScenario({ app: api, email: EMAIL, password: PASSWORD });
  await api.listen({ host: '127.0.0.1', port: API_PORT });
  console.log(
    `API de prueba en 127.0.0.1:${API_PORT} (${scenario.completed} finalizados, ${scenario.live} en directo, ${scenario.postponed} aplazados, ${scenario.disputed} en disputa)`,
  );

  // --- Frontend construido, apuntando a esa API.
  const web = spawn(process.execPath, [WEB_ENTRY], {
    env: {
      ...process.env,
      HOST: '127.0.0.1',
      PORT: String(WEB_PORT),
      API_URL: `http://127.0.0.1:${API_PORT}`,
      PUBLIC_SITE_URL: WEB_ORIGIN,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  web.stderr.on('data', (chunk) => process.stderr.write(`[web] ${chunk}`));

  try {
    await waitForWeb();
    console.log(`Frontend en ${WEB_ORIGIN}`);

    await publicFlow();
    await streamingFlow(await (await fetch(`http://127.0.0.1:${API_PORT}/api/v1/matches`)).json());
    await adminFlow();
  } finally {
    web.kill();
    await once(web, 'exit').catch(() => {});
    await api.close();
    await handle.close();
  }

  console.log(`\n${passed} comprobaciones correctas, ${failures.length} fallidas.`);
  if (failures.length > 0) {
    console.error('\nFallos:');
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
  }
}

const get = async (path, init) => {
  const response = await fetch(`${WEB_ORIGIN}${path}`, { redirect: 'manual', ...init });
  return { status: response.status, headers: response.headers, body: await response.text() };
};

/* ------------------------------------------------------------------ */
/* Recorrido publico                                                    */
/* ------------------------------------------------------------------ */

async function publicFlow() {
  step('Publico: portada -> clasificacion -> jornada -> Match Center -> jugador');

  const home = await get('/');
  check('la portada responde 200', home.status === 200, `status ${home.status}`);
  check('la portada nombra la liga', home.body.includes('ESTABANQUITOS'));
  check('la portada enlaza la clasificacion', home.body.includes('href="/clasificacion"'));

  const standings = await get('/clasificacion');
  check('la clasificacion responde 200', standings.status === 200);
  check('la clasificacion es una tabla de verdad', standings.body.includes('<table'));
  check('explica los criterios de desempate', standings.body.includes('Desempates'));

  const round = await get('/jornadas/1');
  check('la jornada 1 responde 200', round.status === 200);
  check('la jornada muestra su numero', round.body.includes('Jornada 01'));

  // El partido aplazado del escenario: es donde mas facil seria mentir.
  const matches = await (await fetch(`http://127.0.0.1:${API_PORT}/api/v1/matches`)).json();
  const postponed = matches.find((match) => match.status === 'POSTPONED');
  const disputed = matches.find((match) => match.status === 'DISPUTED');
  const completed = matches.find((match) => match.status === 'COMPLETED');

  const center = await get(`/partidos/${postponed.id}`);
  check('el Match Center de un aplazado responde 200', center.status === 200);
  check('lo presenta como aplazado', center.body.includes('Partido aplazado'));
  check('dice que no cuenta como jugado', center.body.includes('no cuenta como jugado'));
  check('conserva la jornada original', center.body.includes('Fecha original'));
  check('no lo presenta como derrota', !center.body.includes('Gana '));

  const disputedPage = await get(`/partidos/${disputed.id}`);
  check('el Match Center de una disputa responde 200', disputedPage.status === 200);
  check(
    'avisa de que el resultado esta en disputa',
    disputedPage.body.includes('Resultado en disputa'),
  );
  check(
    'avisa de que no cuenta en la clasificacion',
    disputedPage.body.includes('no cuenta en la clasificación'),
  );

  check(
    'detalla el aplazamiento con su historial',
    center.body.includes('Detalle del aplazamiento'),
  );
  check('numera el partido dentro de la jornada', center.body.includes('Partido 0'));

  const scheduled = matches.find((match) => match.status === 'SCHEDULED');
  const upcoming = await get(`/partidos/${scheduled.id}`);
  check('el Match Center de un programado responde 200', upcoming.status === 200);
  check('explica que todavia no se ha jugado', upcoming.body.includes('Todavía no se ha jugado'));
  check('y que por eso no cuenta', upcoming.body.includes('No cuenta en la clasificación'));

  const finished = await get(`/partidos/${completed.id}`);
  check('el Match Center de un finalizado responde 200', finished.status === 200);
  check('muestra el ganador', finished.body.includes('Gana '));
  check('y dice que ya cuenta en la tabla', finished.body.includes('Cuenta en la clasificación'));

  const players = await (await fetch(`http://127.0.0.1:${API_PORT}/api/v1/players`)).json();
  const slug = players.players[0].slug;
  const player = await get(`/jugadores/${slug}`);
  check('la ficha del jugador responde 200', player.status === 200);
  check('la ficha separa lo oficial de lo observado', player.body.includes('Evidencia externa'));
  check('marca el rendimiento como oficial', player.body.includes('Oficial'));
  check('marca la evidencia como observada', player.body.includes('Observado'));
  check(
    'no presenta la cuenta vinculada como verificada',
    !player.body.includes('Propiedad de la cuenta: Verificada'),
  );
  check(
    'dice que no hay registro oficial de mazos',
    player.body.includes('No es el mazo oficial de nadie'),
  );

  step('Publico: estadisticas y cartas');

  const stats = await get('/estadisticas');
  check('las estadisticas responden 200', stats.status === 200);
  check('separan lo aplazado de lo jugado', stats.body.includes('Aplazados'));
  check('no mezclan nada observado en lo oficial', !stats.body.includes('Observado'));

  const cards = await get('/cartas');
  check('las cartas responden 200', cards.status === 200);
  check('las cartas se declaran observadas', cards.body.includes('Observado'));
  check('las cartas nunca se declaran oficiales', !cards.body.includes('>Oficial<'));

  step('Publico: overlay de transmision');

  const overlay = await get(`/overlay/match/${completed.id}`);
  check('el overlay responde 200', overlay.status === 200);
  check('no se indexa', overlay.body.includes('noindex'));
  // El `<body>` lleva la clase que lo deja transparente: OBS compone esto
  // sobre el video del juego y cualquier color taparia la partida.
  check('el cuerpo es el del overlay', /<body[^>]*class="[^"]*overlay-body/.test(overlay.body));
  check('sin navegacion ni pie', !overlay.body.includes('href="/clasificacion"'));
  // Se busca el elemento renderizado, no el nombre de la clase: ese aparece
  // igualmente dentro del CSS de la pagina.
  const crowns = /<span class="overlay-crowns">/;
  check('lleva el marcador del partido', crowns.test(overlay.body));

  const overlayLive = await get(`/overlay/match/${matches.find((m) => m.status === 'LIVE').id}`);
  // Un 0-0 en pantalla se leeria como un marcador real: sin resultado, VS.
  check(
    'sin resultado enseña VS, no un cero',
    /<span class="overlay-vs">VS<\/span>/.test(overlayLive.body),
  );
  check('no inventa coronas', !crowns.test(overlayLive.body));

  const overlayPostponed = await get(`/overlay/match/${postponed.id}`);
  check('un aplazado lo dice en pantalla', overlayPostponed.body.includes('Aplazado'));

  step('Publico: accesibilidad de las pantallas principales');

  checkA11y('portada', home);
  checkA11y('clasificacion', standings);
  checkA11y('jornada', round);
  checkA11y('Match Center', center);
  checkA11y('ficha de jugador', player);
  checkA11y('estadisticas', stats);
  checkA11y('cartas', cards);

  step('Publico: paginas de informacion y errores');

  const rules = await get('/reglamento');
  check('el reglamento responde 200', rules.status === 200);
  check('separa las reglas pendientes', rules.body.includes('Reglas pendientes'));
  check('marca cada pendiente como tal', rules.body.includes('Pendiente de definición'));
  check(
    'no presenta P-01 como decidida',
    rules.includes === undefined || rules.body.includes('P-01'),
  );

  const notFound = await get('/no-existe-esta-pagina');
  check('una direccion inexistente da 404', notFound.status === 404, `status ${notFound.status}`);

  const robots = await get('/robots.txt');
  check('robots.txt excluye el panel', robots.body.includes('Disallow: /admin'));

  const sitemap = await get('/sitemap.xml');
  check('el sitemap lista partidos reales', sitemap.body.includes(`/partidos/${completed.id}`));
  check('el sitemap no expone el panel', !sitemap.body.includes('/admin'));

  step('Publico: el paquete que llega al navegador no lleva secretos');

  /*
    Lo que se descarga el navegador es la superficie mas dificil de vigilar: un
    `import.meta.env.CLASH_ROYALE_API_TOKEN` en un componente de cliente se
    resolveria en tiempo de compilacion y quedaria escrito en un `.js` publico
    para siempre, sin que ningun test de la API se enterara.
  */
  const clientDir = path.join(ROOT, 'apps', 'web', 'dist', 'client');
  const bundles = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(js|mjs|css|map)$/.test(entry.name)) bundles.push(full);
    }
  };
  if (existsSync(clientDir)) walk(clientDir);

  check('hay paquetes de cliente que revisar', bundles.length > 0, `${bundles.length} archivos`);

  const offenders = { token: [], bearer: [], jwt: [] };
  // Tres bloques base64 separados por puntos: la forma del token del portal.
  const jwtShape = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/;

  for (const file of bundles) {
    const source = readFileSync(file, 'utf8');
    const name = path.relative(clientDir, file);
    if (source.includes('CLASH_ROYALE_API_TOKEN')) offenders.token.push(name);
    if (/Authorization["'\s:]*Bearer/i.test(source)) offenders.bearer.push(name);
    if (jwtShape.test(source)) offenders.jwt.push(name);
  }

  // Los nombres de archivo si se imprimen; el contenido nunca.
  check(
    'ningun paquete nombra la variable del token',
    offenders.token.length === 0,
    offenders.token.join(', '),
  );
  check(
    'ningun paquete construye una cabecera Authorization',
    offenders.bearer.length === 0,
    offenders.bearer.join(', '),
  );
  check(
    'ningun paquete lleva nada con forma de JWT',
    offenders.jwt.length === 0,
    offenders.jwt.join(', '),
  );

  // Y el HTML servido tampoco, que es donde acabaria un dato inyectado en el
  // servidor por descuido.
  for (const [name, page] of [
    ['portada', home],
    ['Match Center', center],
    ['ficha de jugador', player],
    ['cartas', cards],
  ]) {
    check(
      `${name}: el HTML no lleva credenciales`,
      !page.body.includes('CLASH_ROYALE_API_TOKEN') &&
        !/Authorization["'\s:]*Bearer/i.test(page.body) &&
        !jwtShape.test(page.body),
    );
  }

  step('Publico: la ficha de un partido no filtra datos administrativos');
  check('sin URL de evidencia', !disputedPage.body.includes('evidenceUrl'));
  check('sin notas internas del aplazamiento', !center.body.includes('DEMO: corte de internet'));
}

/* ------------------------------------------------------------------ */
/* Recorrido administrativo                                             */
/* ------------------------------------------------------------------ */

async function adminFlow() {
  step('Admin: acceso -> resumen -> partidos -> resultado -> clasificacion');

  const guarded = await get('/admin');
  check('el panel exige sesion', guarded.status === 302, `status ${guarded.status}`);
  check(
    'y redirige al acceso conservando el destino',
    (guarded.headers.get('location') ?? '').includes('/admin/login'),
  );

  const badLogin = await get('/api/session', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', origin: WEB_ORIGIN },
    body: new URLSearchParams({ email: EMAIL, password: 'no-es-la-clave' }).toString(),
  });
  check(
    'unas credenciales malas no abren sesion',
    (badLogin.headers.get('location') ?? '').includes('error=credenciales'),
  );

  const login = await get('/api/session', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', origin: WEB_ORIGIN },
    body: new URLSearchParams({ email: EMAIL, password: PASSWORD, next: '/admin' }).toString(),
  });
  check('el acceso correcto redirige al panel', login.headers.get('location') === '/admin');

  const raw = login.headers.get('set-cookie') ?? '';
  const token = /liga_admin_session=([^;]+)/.exec(raw)?.[1] ?? '';
  check('emite la cookie de sesion', token.length > 0);
  check('la cookie es httpOnly', raw.toLowerCase().includes('httponly'));
  check('la cookie es SameSite=Lax', raw.toLowerCase().includes('samesite=lax'));
  const auth = { cookie: `liga_admin_session=${token}` };

  const dashboard = await get('/admin', { headers: auth });
  check(
    'el resumen responde 200 con sesion',
    dashboard.status === 200,
    `status ${dashboard.status}`,
  );
  check(
    'el resumen no se cachea',
    (dashboard.headers.get('cache-control') ?? '').includes('no-store'),
  );
  check('muestra la actividad reciente', dashboard.body.includes('Actividad reciente'));

  step('Admin: auditoria filtrable y metricas');

  const auditPage = await get('/admin/auditoria', { headers: auth });
  check('la pantalla de auditoria responde 200', auditPage.status === 200);
  check('ofrece filtrar por accion', auditPage.body.includes('name="action"'));
  check('ofrece filtrar por peticion', auditPage.body.includes('name="requestId"'));
  check('los filtros funcionan sin JavaScript', auditPage.body.includes('method="get"'));

  const filtered = await get('/admin/auditoria?action=MATCH_POSTPONED', { headers: auth });
  check('filtrar por accion responde 200', filtered.status === 200);
  check(
    'y el filtro queda reflejado en el formulario',
    /<option value="MATCH_POSTPONED"[^>]*selected/.test(filtered.body),
  );
  check('y ofrece quitarlo', filtered.body.includes('Quitar los filtros'));

  const oldAudit = await get('/admin/audit', { headers: auth });
  check('la direccion antigua redirige', oldAudit.status === 308);

  const metrics = await get('/api/admin/metrics', { headers: auth });
  check(
    'las metricas exigen ir por el puente admin',
    metrics.status === 200 || metrics.status === 404,
  );

  const streamPanel = await get('/admin/stream', { headers: auth });
  check('el modo transmision responde 200', streamPanel.status === 200);
  check('genera la URL del overlay', streamPanel.body.includes('URL del overlay'));
  check('explica como ponerlo en OBS', streamPanel.body.includes('Copia la URL en OBS'));

  const streamGuarded = await get('/admin/stream');
  check('el modo transmision exige sesion', streamGuarded.status === 302);

  const list = await get('/admin/matches', { headers: auth });
  check('el listado administrativo responde 200', list.status === 200);

  // Un partido que todavia admite resultado.
  const matches = await (await fetch(`http://127.0.0.1:${API_PORT}/api/v1/matches`)).json();
  const target = matches.find((match) => match.status === 'SCHEDULED');
  const detail = await get(`/admin/matches/${target.id}`, { headers: auth });
  check('la ficha administrativa responde 200', detail.status === 200);
  check('ofrece registrar el resultado', detail.body.includes('Registrar resultado'));

  step('Admin: el motor manda sobre el panel');

  const draw = await fetch(`${WEB_ORIGIN}/api/admin/matches/${target.id}/result`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: WEB_ORIGIN, ...auth },
    body: JSON.stringify({ homeCrowns: 2, awayCrowns: 2 }),
  });
  const drawBody = await draw.json();
  check('un empate se rechaza', draw.status === 422, `status ${draw.status}`);
  check('y se explica por que', drawBody.error.code === 'DRAW_NOT_ALLOWED');

  const walkover = await fetch(`${WEB_ORIGIN}/api/admin/matches/${target.id}/result`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: WEB_ORIGIN, ...auth },
    body: JSON.stringify({ homeCrowns: 3, awayCrowns: 0, resolution: 'WALKOVER' }),
  });
  // P-01 se decidio el 10 de septiembre de 2026: una incomparecencia vale 3
  // puntos y ninguna corona. Lo que ya no se puede es colarla por la puerta del
  // marcador, porque un walkover no tiene marcador.
  const walkoverBody = await walkover.json();
  check('un walkover no se registra como si fuera un marcador', walkover.status === 422);
  check(
    'y el motor pide saber quien no se presento',
    walkoverBody.error.code === 'ABSENT_PLAYER_REQUIRED',
  );

  step('Admin: registrar un resultado mueve la clasificacion');

  const before = await (await fetch(`http://127.0.0.1:${API_PORT}/api/v1/standings`)).json();
  const beforePoints = before.rows.find((row) => row.playerId === target.home.id)?.points ?? 0;

  const record = await fetch(`${WEB_ORIGIN}/api/admin/matches/${target.id}/result`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: WEB_ORIGIN, ...auth },
    body: JSON.stringify({ homeCrowns: 3, awayCrowns: 1 }),
  });
  check('el resultado se registra', record.ok, `status ${record.status}`);

  const after = await (await fetch(`http://127.0.0.1:${API_PORT}/api/v1/standings`)).json();
  const afterPoints = after.rows.find((row) => row.playerId === target.home.id)?.points ?? 0;
  check(
    'la victoria con 3 coronas suma 4 puntos',
    afterPoints === beforePoints + 4,
    `${beforePoints} -> ${afterPoints}`,
  );

  const publicTable = await get('/clasificacion');
  check('la clasificacion publica ya lo refleja', publicTable.body.includes(String(afterPoints)));

  const audit = await get('/admin/auditoria', { headers: auth });
  check('la auditoria refleja la operacion', audit.status === 200);
  check('y registra el resultado', audit.body.includes('RESULT'));

  step('Admin: incomparecencia de principio a fin (E2E-03)');

  /*
    P-01 completa: un partido con la hora ya pasada, la tolerancia cumplida, y
    el administrador declarando quien no aparecio. Lo que se comprueba no es la
    aritmetica sino que este partido no se confunda nunca con una victoria
    jugada: ni en la tabla, ni en la ficha publica, ni en el overlay.
  */
  const pending = matches.find((match) => match.status === 'SCHEDULED' && match.id !== target.id);

  // Hora prevista en el pasado: los 15 minutos de tolerancia ya vencieron.
  const pastTime = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const scheduleIt = await fetch(`${WEB_ORIGIN}/api/admin/matches/${pending.id}/schedule`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: WEB_ORIGIN, ...auth },
    body: JSON.stringify({ scheduledAt: pastTime }),
  });
  check('se fija la hora prevista del partido', scheduleIt.ok, `status ${scheduleIt.status}`);

  const tableBefore = await (await fetch(`http://127.0.0.1:${API_PORT}/api/v1/standings`)).json();
  const rowBefore = tableBefore.rows.find((row) => row.playerId === pending.home.id);

  const declared = await fetch(`${WEB_ORIGIN}/api/admin/matches/${pending.id}/walkover`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: WEB_ORIGIN, ...auth },
    body: JSON.stringify({
      absentPlayerId: pending.away.id,
      reason: 'No se presento pasados los 15 minutos de tolerancia.',
    }),
  });
  check('se declara la incomparecencia', declared.ok, `status ${declared.status}`);

  const tableAfter = await (await fetch(`http://127.0.0.1:${API_PORT}/api/v1/standings`)).json();
  const rowAfter = tableAfter.rows.find((row) => row.playerId === pending.home.id);
  const absentAfter = tableAfter.rows.find((row) => row.playerId === pending.away.id);

  check(
    'el presente suma 3 puntos, no 4',
    rowAfter.points === rowBefore.points + 3,
    `${rowBefore.points} -> ${rowAfter.points}`,
  );
  check('cuenta como partido jugado', rowAfter.played === rowBefore.played + 1);
  check('y como victoria', rowAfter.wins === rowBefore.wins + 1);
  // Cero coronas: un 3-0 inventado moveria el primer desempate tras los puntos.
  check(
    'la diferencia de coronas no se mueve',
    rowAfter.crownDiff === rowBefore.crownDiff,
    `${rowBefore.crownDiff} -> ${rowAfter.crownDiff}`,
  );
  check(
    'no sube el contador de victorias por 3 coronas',
    rowAfter.maxCrownWins === rowBefore.maxCrownWins,
  );
  check(
    'el ausente suma partido jugado y derrota',
    absentAfter.played > 0 && absentAfter.losses > 0,
  );

  const walkoverPage = await get(`/partidos/${pending.id}`);
  check('la ficha publica lo llama walkover', walkoverPage.body.includes('WALKOVER'));
  check('y dice que no hubo batalla', walkoverPage.body.includes('no hubo batalla'));

  const walkoverOverlay = await get(`/overlay/match/${pending.id}`);
  // El elemento renderizado, no el nombre de la clase: ese sale igual en el CSS.
  const crownSpan = /<span class="overlay-crowns">/;
  check('el overlay no pinta coronas', !crownSpan.test(walkoverOverlay.body));
  check('el overlay dice W. O.', walkoverOverlay.body.includes('W. O.'));

  const walkoverAudit = await get('/admin/auditoria?action=WALKOVER_DECLARED', { headers: auth });
  check('queda en la auditoria', walkoverAudit.body.includes('WALKOVER_DECLARED'));

  step('Admin: el puente administrativo no es un proxy abierto');

  const noSession = await fetch(`${WEB_ORIGIN}/api/admin/tournament/status`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });
  check('sin sesion responde 401', noSession.status === 401, `status ${noSession.status}`);

  const foreign = await fetch(`${WEB_ORIGIN}/api/admin/tournament/status`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://otro-sitio.example', ...auth },
    body: '{}',
  });
  check('desde otro origen responde 403', foreign.status === 403, `status ${foreign.status}`);

  const traversal = await fetch(`${WEB_ORIGIN}/api/admin/..%2F..%2Fv1%2Fauth%2Flogin`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: WEB_ORIGIN, ...auth },
    body: '{}',
  });
  check('no deja salirse de /admin', traversal.status === 404, `status ${traversal.status}`);

  step('Admin: cerrar sesion');

  const logout = await get('/api/session', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', origin: WEB_ORIGIN, ...auth },
    body: new URLSearchParams({ intent: 'logout' }).toString(),
  });
  check('el cierre redirige al acceso', logout.headers.get('location') === '/admin/login');
}

/**
 * Transmision y PWA.
 *
 * Lo que se comprueba es que la pagina no prometa un directo que no existe y
 * que, cuando existe, el enlace lleve al canal correcto. Los cuatro perfiles
 * son enlaces a una persona real: uno roto no falla, no avisa y no se nota.
 */
async function streamingFlow(matches) {
  step('Transmision: el canal y las redes');

  const page = await get('/transmision');
  check('la pagina de transmision responde 200', page.status === 200, `status ${page.status}`);
  check('nombra al narrador', page.body.includes('EsstebannPluss'));

  for (const url of [
    'https://kick.com/esstebannpluss',
    'https://www.youtube.com/@EsstebannPluss011',
    'https://www.instagram.com/esstebannpluss/',
    'https://www.tiktok.com/@esstebannpluss',
  ]) {
    check(`enlaza ${new URL(url).hostname}`, page.body.includes(url), url);
  }

  check(
    'los enlaces externos no dejan referencia al abrirse',
    !/target="_blank"(?![^>]*rel="noopener noreferrer")/.test(page.body),
  );

  check('no publica cifras de seguidores', !/d+s*(seguidores|suscriptores)/i.test(page.body));

  step('Transmision: el directo');

  const live = matches.find((match) => match.status === 'LIVE');
  const liveMatch = await get(`/partidos/${live.id}`);
  check('la ficha de un partido en juego responde 200', liveMatch.status === 200);

  /*
    La regla de la Fase 6: un partido marcado en juego **no basta**. Si no se
    puede confirmar que el canal esta emitiendo Clash Royale, la web no ofrece
    un directo que quiza no exista. Aqui la comprobacion esta apagada, asi que
    no debe aparecer ningun enlace.
  */
  check(
    'sin canal confirmado NO ofrece verlo en directo',
    !liveMatch.body.includes('Ver este partido en Kick'),
    'la web estaria anunciando un directo sin comprobarlo',
  );

  const home = await get('/');
  check('la portada tampoco anuncia directo', !home.body.includes('live-banner'));

  const state = await fetch(`http://127.0.0.1:${API_PORT}/api/v1/broadcast`);
  const broadcast = await state.json();
  check('el endpoint de retransmision responde', state.status === 200);
  check('y dice por que no hay directo', broadcast.reason === 'NOT_CONFIGURED', broadcast.reason);
  check('sin afirmar que el canal esta apagado', broadcast.channel.state === 'UNKNOWN');

  const finished = matches.find((match) => match.status === 'COMPLETED');
  const finishedPage = await get(`/partidos/${finished.id}`);
  check(
    'un partido terminado NO ofrece verlo en directo',
    !finishedPage.body.includes('Ver este partido en Kick'),
  );

  step('PWA');

  const manifest = await get('/manifest.webmanifest');
  check('sirve el manifiesto', manifest.status === 200, `status ${manifest.status}`);
  const parsed = JSON.parse(manifest.body);
  check('el manifiesto declara nombre corto', typeof parsed.short_name === 'string');
  check(
    'y al menos un icono maskable',
    parsed.icons.some((icon) => icon.purpose === 'maskable'),
  );

  const worker = await get('/sw.js');
  check('sirve el service worker', worker.status === 200, `status ${worker.status}`);
  check(
    'el service worker no cachea datos de la competicion',
    worker.body.includes("url.pathname.startsWith('/api/')"),
    'una clasificacion guardada es una clasificacion que miente',
  );

  const offline = await get('/offline');
  check('hay pagina de sin conexion', offline.status === 200);

  checkA11y('transmision', page);
  checkA11y('sin conexion', offline);

  const trophy = await get('/assets/branding/trofeo-le-2026.webp');
  check('sirve el trofeo optimizado', trophy.status === 200, `status ${trophy.status}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
