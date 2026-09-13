import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // Cada suite levanta su propio PostgreSQL en WebAssembly.
    testTimeout: 30_000,
    hookTimeout: 90_000,
    /*
      Los archivos corren **de uno en uno**.

      Cada suite arranca un PGlite, que es un PostgreSQL entero compilado a
      WebAssembly viviendo en la memoria del proceso. En paralelo, nueve de esos
      agotaban la memoria y vitest mataba a sus trabajadores con un
      «Worker exited unexpectedly» que no señala a ningún test: parecía un fallo
      de la suite que acababa de escribirse y no lo era.

      Tampoco se pierde gran cosa: el arranque de PGlite domina el tiempo y es
      trabajo de CPU, así que el paralelismo apenas lo acortaba.
    */
    fileParallelism: false,
  },
});
