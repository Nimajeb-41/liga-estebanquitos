/**
 * Auditoria de secretos en archivos versionables.
 *
 * Existe porque ya pasó: durante la Fase 3 el token real de Clash Royale acabó
 * escrito en `.env.example`, que es una plantilla destinada a versionarse.
 *
 * **Este script no imprime valores jamas.** Informa del archivo, la linea y el
 * tipo de hallazgo. Enseñar el secreto para avisar de que hay un secreto seria
 * repetir el incidente.
 *
 *   npm run audit:secrets
 *
 * Sale con codigo 1 si encuentra algo, para poder colgarlo de un hook o de CI.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

/** Nunca se entra aqui: o no se versiona, o es ruido. */
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'coverage', '.astro', 'evidence']);

/** `.env` es local y esta ignorado: su contenido no se audita. */
const SKIP_FILES = new Set(['.env', '.env.local']);

const EXTENSIONS = /\.(ts|tsx|js|mjs|cjs|json|md|astro|css|sql|ya?ml|txt|example|sh|html)$/i;

/**
 * Que se busca.
 *
 * Los patrones evitan a proposito las interpolaciones (`${...}`) y las
 * referencias a variables de entorno, que son justamente la forma correcta.
 */
const PATTERNS = [
  { label: 'JWT', re: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\./ },
  { label: 'Bearer con valor', re: /Bearer\s+[A-Za-z0-9._~+/-]{20,}/ },
  { label: 'contrasena literal', re: /(password|passwd|pwd)\s*[:=]\s*["'`][^"'`$\n]{8,}/i },
  {
    label: 'secreto literal',
    re: /(secret|api[_-]?key|access[_-]?token|auth[_-]?token)\s*[:=]\s*["'`][^"'`$\n]{16,}/i,
  },
  { label: 'clave privada', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
];

/** Claves de plantilla que deben quedar siempre sin valor. */
const TEMPLATE_SECRET_KEYS = [
  'CLASH_ROYALE_API_TOKEN',
  'ADMIN_PASSWORD',
  'DATABASE_PASSWORD',
  'SESSION_SECRET',
];

/** Lineas que son ejemplos o pruebas, no secretos de verdad. */
function isFalsePositive(line) {
  const lowered = line.toLowerCase();
  return (
    lowered.includes('process.env') ||
    lowered.includes('import.meta.env') ||
    lowered.includes('secreto-de-prueba') ||
    lowered.includes('secreto-que-no-debe-salir') ||
    lowered.includes('contrasena-de-prueba') ||
    lowered.includes('demo-liga-estabanquitos') ||
    lowered.includes('tu_token_aqui') ||
    // Credenciales de prueba: valores deliberadamente falsos que los tests
    // usan para comprobar que el acceso se rechaza.
    lowered.includes('incorrecta') ||
    lowered.includes('no-es-la-clave') ||
    lowered.includes('e2e-liga-estabanquitos')
  );
}

function walk(dir, files = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name) || SKIP_FILES.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, files);
      continue;
    }
    if (!EXTENSIONS.test(entry.name) && entry.name !== '.gitignore') continue;
    if (statSync(full).size > 3_000_000) continue;
    files.push(full);
  }
  return files;
}

const findings = [];
const files = walk('.');

for (const file of files) {
  let content;
  try {
    content = readFileSync(file, 'utf8');
  } catch {
    continue;
  }

  content.split(/\r?\n/).forEach((line, index) => {
    if (isFalsePositive(line)) return;
    for (const { label, re } of PATTERNS) {
      if (re.test(line)) {
        findings.push({ file: file.replace(/\\/g, '/'), line: index + 1, label });
      }
    }
  });
}

/* Comprobaciones estructurales, ademas de los patrones. */
const structural = [];

try {
  const template = readFileSync('.env.example', 'utf8');
  for (const key of TEMPLATE_SECRET_KEYS) {
    const line = template.split(/\r?\n/).find((entry) => entry.startsWith(`${key}=`));
    if (line !== undefined && line !== `${key}=`) {
      structural.push(`.env.example: ${key} tiene un valor. Debe quedar vacio.`);
    }
  }
} catch {
  structural.push('.env.example no existe.');
}

try {
  const ignored = readFileSync('.gitignore', 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim());
  for (const required of ['.env', 'evidence/']) {
    if (!ignored.includes(required)) {
      structural.push(`.gitignore no declara "${required}".`);
    }
  }
} catch {
  structural.push('.gitignore no existe.');
}

/* Salida. */
console.log(`\n  Auditoria de secretos · ${files.length} archivos versionables analizados\n`);

if (findings.length === 0 && structural.length === 0) {
  console.log('  Sin hallazgos.\n');
  process.exit(0);
}

if (findings.length > 0) {
  console.log('  POSIBLES SECRETOS (no se muestra el valor):');
  for (const finding of findings) {
    console.log(`    ${finding.label.padEnd(20)} ${finding.file}:${finding.line}`);
  }
  console.log('');
}

if (structural.length > 0) {
  console.log('  PROBLEMAS DE CONFIGURACION:');
  for (const problem of structural) console.log(`    ${problem}`);
  console.log('');
}

console.log('  Revisa cada linea a mano. Si es un secreto de verdad: retiralo,');
console.log('  rota la credencial y da por comprometida la anterior.\n');
process.exit(1);
