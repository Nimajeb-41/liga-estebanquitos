/**
 * Pone la liga en línea con un solo comando.
 *
 *     npm run online
 *
 * Arranca las tres piezas en orden y espera a que cada una responda antes de
 * seguir con la siguiente:
 *
 *   1. la API y la base de datos   (127.0.0.1:3000)
 *   2. el sitio ya construido      (127.0.0.1:4321)
 *   3. el túnel público            (el dominio fijo de ngrok)
 *
 * El orden importa. Abrir el túnel antes de que el sitio responda publica una
 * web rota: desde fuera no se distingue de un servidor mal hecho.
 *
 * **Las tres viven mientras esta ventana siga abierta.** Al cerrarla, o al
 * pulsar Ctrl+C, se paran las tres juntas. Es deliberado: dejar procesos
 * sueltos por el sistema acaba en dos servidores peleándose por la misma
 * carpeta de base de datos, que PGlite abre en exclusiva.
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const RAIZ = process.cwd();
const ENV_FILE = path.join(RAIZ, '.env');

function leerEnv() {
  if (!fs.existsSync(ENV_FILE)) return {};
  return Object.fromEntries(
    fs
      .readFileSync(ENV_FILE, 'utf8')
      .split('\n')
      .filter((linea) => linea.trim() && !linea.startsWith('#') && linea.includes('='))
      .map((linea) => [
        linea.slice(0, linea.indexOf('=')).trim(),
        linea.slice(linea.indexOf('=') + 1).trim(),
      ]),
  );
}

/** Dónde está ngrok. No se confía en el PATH: winget no lo propaga. */
function buscarNgrok() {
  const candidatos = [
    process.env['NGROK_PATH'],
    path.join(os.homedir(), 'AppData', 'Local', 'Microsoft', 'WinGet', 'Links', 'ngrok.exe'),
    path.join(
      os.homedir(),
      'AppData',
      'Local',
      'Microsoft',
      'WinGet',
      'Packages',
      'Ngrok.Ngrok_Microsoft.Winget.Source_8wekyb3d8bbwe',
      'ngrok.exe',
    ),
    '/usr/local/bin/ngrok',
    '/opt/homebrew/bin/ngrok',
  ].filter((ruta) => typeof ruta === 'string' && ruta !== '');

  return candidatos.find((ruta) => fs.existsSync(ruta)) ?? 'ngrok';
}

const hijos = [];

/** Lanza una pieza y se queda con su proceso para poder pararlo después. */
function lanzar(nombre, comando, args) {
  const hijo = spawn(comando, args, { cwd: RAIZ, stdio: ['ignore', 'pipe', 'pipe'] });
  hijos.push({ nombre, hijo });

  hijo.on('error', (error) => {
    console.error(`\n  [${nombre}] no se pudo ejecutar: ${error.message}\n`);
    parar(1);
  });

  hijo.on('exit', (codigo) => {
    // Si una pieza se cae, las otras dos no sirven de nada por separado.
    if (!parando) {
      console.error(`\n  [${nombre}] se cerró (código ${codigo}). Parando el resto.\n`);
      parar(codigo ?? 1);
    }
  });

  return hijo;
}

/** Espera a que un puerto conteste. Devuelve `false` si se agota el plazo. */
async function esperar(puerto, ruta, segundos) {
  const limite = Date.now() + segundos * 1000;
  while (Date.now() < limite) {
    try {
      const res = await fetch(`http://127.0.0.1:${puerto}${ruta}`, {
        signal: AbortSignal.timeout(2500),
      });
      if (res.status < 500) return true;
    } catch {
      /* Todavía no. Se reintenta. */
    }
    await new Promise((listo) => setTimeout(listo, 700));
  }
  return false;
}

let parando = false;

function parar(codigo) {
  if (parando) return;
  parando = true;
  for (const { hijo } of hijos) {
    try {
      hijo.kill();
    } catch {
      /* Ya estaba muerto. */
    }
  }
  setTimeout(() => process.exit(codigo), 400);
}

async function main() {
  const env = leerEnv();
  const dominio = (env['TUNNEL_DOMAIN'] ?? '').trim();
  const puertoWeb = env['WEB_PORT'] ?? '4321';

  const construido = path.join(RAIZ, 'apps', 'web', 'dist', 'server', 'entry.mjs');
  if (!fs.existsSync(construido)) {
    console.error(
      '\n  Falta el sitio construido. Ejecuta antes:\n\n    npm run build --workspace=@liga/web\n',
    );
    process.exit(1);
  }

  console.log('\n  Poniendo la liga en línea...\n');

  /* 1. API y base de datos. */
  process.stdout.write('  [1/3] API y base de datos... ');
  lanzar('api', process.execPath, ['--env-file=.env', 'apps/api/src/index.ts']);
  if (!(await esperar(3000, '/health', 45))) {
    console.error('no responde.\n\n  Mira si hay otro servidor abierto con la misma base.\n');
    return parar(1);
  }
  console.log('lista');

  /* 2. El sitio. */
  process.stdout.write('  [2/3] El sitio............. ');
  lanzar('web', process.execPath, ['--env-file=.env', 'apps/web/dist/server/entry.mjs']);
  if (!(await esperar(puertoWeb, '/', 45))) {
    console.error('no responde.\n');
    return parar(1);
  }
  console.log('listo');

  /* 3. El túnel. */
  if (dominio === '') {
    console.log('  [3/3] Túnel................ omitido (falta TUNNEL_DOMAIN en .env)');
    console.log(`\n  Solo en local: http://127.0.0.1:${puertoWeb}\n`);
  } else {
    process.stdout.write('  [3/3] Túnel público........ ');
    lanzar('tunel', buscarNgrok(), [
      'http',
      String(puertoWeb),
      '--domain',
      dominio,
      '--log',
      'stdout',
    ]);
    // El túnel tarda un poco en registrarse contra el borde de ngrok.
    await new Promise((listo) => setTimeout(listo, 6000));
    console.log('abierto');

    console.log(
      [
        '',
        '  La liga está en línea',
        '',
        `    https://${dominio}`,
        '',
        '  Esta ventana tiene que quedarse abierta.',
        '  Ctrl+C para parar las tres piezas.',
        '',
      ].join('\n'),
    );
  }

  for (const senal of ['SIGINT', 'SIGTERM']) process.on(senal, () => parar(0));
}

main().catch((error) => {
  console.error('\n  No se pudo arrancar:', error.message, '\n');
  parar(1);
});
