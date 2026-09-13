import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      'packages/database/drizzle/**',
      // Tipos que genera Astro en cada build. No son codigo del proyecto.
      'apps/web/.astro/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node },
      parserOptions: { ecmaVersion: 2023, sourceType: 'module' },
    },
    rules: {
      // El proyecto usa `interface` y tipos explicitos; lo demas lo cubre tsc
      // en modo estricto, asi que ESLint solo vigila lo que tsc no ve.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      'no-console': ['warn', { allow: ['error'] }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'prefer-const': 'error',
    },
  },
  {
    // Los scripts de linea de comandos si informan por consola.
    files: ['apps/api/src/scripts/**/*.ts', 'packages/database/src/migrate.ts', 'scripts/**/*.mjs'],
    rules: { 'no-console': 'off' },
  },
  {
    files: ['**/test/**/*.ts'],
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },
  {
    /*
      El service worker corre en su propio hilo: no tiene `window` ni `document`,
      y si tiene `self` y `caches`. Sin esto, ESLint lo mide con las reglas del
      navegador y protesta por lo unico que ahi existe.
    */
    files: ['apps/web/public/sw.js'],
    languageOptions: { globals: { ...globals.serviceworker } },
  },
);
