/**
 * Abre la liga al mundo.
 *
 * Levanta el túnel de ngrok contra el sitio local y deja la URL pública fija
 * que se le pasa a la gente. Hace dos cosas más que importan:
 *
 * 1. **Comprueba antes de abrir.** Si el sitio no responde en local, avisa en
 *    vez de publicar un túnel hacia un puerto muerto —que desde fuera se ve
 *    como una web rota, no como un servidor apagado.
 * 2. **Recuerda la URL.** Queda escrita en `.env` (`PUBLIC_SITE_URL`) para que
 *    los enlaces canónicos, el sitemap y las tarjetas al compartir apunten
 *    donde deben.
 *
 * El dominio fijo va en `TUNNEL_DOMAIN`. Sin él, ngrok asigna uno aleatorio en
 * cada arranque, que es justo lo que no se quiere: la URL se reparte una vez y
 * tiene que seguir sirviendo el domingo siguiente.
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ENV_FILE = path.resolve(process.cwd(), '.env');

/**
 * Dónde está ngrok.
 *
 * No se confía en el PATH: cuando se instala con winget, la variable no llega a
 * las terminales que ya estaban abiertas, y el error que sale —«no se reconoce
 * como un comando»— no dice que el programa sí está instalado.
 *
 * Se prueban los sitios conocidos y, si no aparece, se deja que el sistema lo
 * resuelva por nombre.
 */
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

  for (const ruta of candidatos) {
    if (fs.existsSync(ruta)) return ruta;
  }
  return 'ngrok';
}

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

/** Deja `PUBLIC_SITE_URL` y `CORS_ORIGINS` apuntando a la URL pública. */
function guardarUrl(url) {
  let contenido = fs.readFileSync(ENV_FILE, 'utf8');
  for (const clave of ['PUBLIC_SITE_URL', 'CORS_ORIGINS']) {
    const patron = new RegExp(`^${clave}=.*$`, 'm');
    contenido = patron.test(contenido)
      ? contenido.replace(patron, `${clave}=${url}`)
      : `${contenido.trimEnd()}\n${clave}=${url}\n`;
  }
  fs.writeFileSync(ENV_FILE, contenido);
}

async function sitioEnPie(puerto) {
  try {
    const res = await fetch(`http://127.0.0.1:${puerto}/`, { signal: AbortSignal.timeout(4000) });
    return res.status < 500;
  } catch {
    return false;
  }
}

async function main() {
  const env = leerEnv();
  const puerto = env['WEB_PORT'] ?? '4321';
  const dominio = (env['TUNNEL_DOMAIN'] ?? '').trim();

  if (dominio === '') {
    console.error(
      [
        '',
        'Falta TUNNEL_DOMAIN en .env.',
        '',
        'Es el dominio fijo que ngrok asigna a tu cuenta. Sin el, cada arranque',
        'da una URL distinta y hay que repartirla de nuevo.',
        '',
        '  1. Entra en dashboard.ngrok.com -> Domains',
        '  2. Copia el que aparece (algo.ngrok-free.app)',
        '  3. Ponlo en .env:  TUNNEL_DOMAIN=algo.ngrok-free.app',
        '',
      ].join('\n'),
    );
    process.exit(1);
  }

  if (!(await sitioEnPie(puerto))) {
    console.error(
      [
        '',
        `El sitio no responde en 127.0.0.1:${puerto}.`,
        '',
        'Arranca antes, cada uno en su terminal:',
        '',
        '  npm run liga    la API y la base de datos',
        '  npm run web     el sitio',
        '',
        'Abrir el tunel ahora publicaria una web rota.',
        '',
      ].join('\n'),
    );
    process.exit(1);
  }

  const url = `https://${dominio}`;
  guardarUrl(url);

  console.log(
    [
      '',
      '  La liga esta en linea',
      '',
      `    ${url}`,
      '',
      '  Esta URL no cambia: se reparte una vez.',
      '  Mientras esta ventana siga abierta, la web se ve desde fuera.',
      '',
      '  Recuerda: si cambiaste PUBLIC_SITE_URL, reconstruye con',
      '  "npm run build --workspace=@liga/web" y reinicia "npm run web".',
      '',
    ].join('\n'),
  );

  const binario = buscarNgrok();
  const ngrok = spawn(binario, ['http', puerto, '--domain', dominio, '--log', 'stdout'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  ngrok.on('error', (error) => {
    console.error(
      [
        '',
        `No se pudo ejecutar ngrok (${error.message}).`,
        '',
        'Si lo acabas de instalar, cierra y vuelve a abrir la terminal: el PATH',
        'no llega a las que ya estaban abiertas. O indica la ruta a mano:',
        '',
        '  NGROK_PATH=C:/ruta/a/ngrok.exe npm run tunel',
        '',
      ].join('\n'),
    );
    process.exit(1);
  });

  ngrok.stdout.on('data', (trozo) => {
    const texto = String(trozo);
    // Solo se saca lo que le sirve a una persona: errores y avisos.
    if (/lvl=(err|crit|warn)/.test(texto)) process.stderr.write(texto);
  });
  ngrok.stderr.on('data', (trozo) => process.stderr.write(trozo));

  ngrok.on('exit', (codigo) => {
    console.log(`\n  El tunel se cerro (codigo ${codigo}). La web ya no se ve desde fuera.\n`);
    process.exit(codigo ?? 0);
  });

  const cerrar = () => {
    ngrok.kill();
    process.exit(0);
  };
  process.on('SIGINT', cerrar);
  process.on('SIGTERM', cerrar);
}

main().catch((error) => {
  console.error('\nEl tunel no pudo arrancar:', error.message, '\n');
  process.exit(1);
});
