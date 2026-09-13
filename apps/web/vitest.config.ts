/// <reference types="vitest" />
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

/**
 * Tests del frontend.
 *
 * Se prueban los componentes React —que es donde vive la interpretación de los
 * datos— con jsdom. Las páginas Astro son composición: lo que hay que verificar
 * de ellas (que un aplazamiento no parezca una derrota, que un resultado en
 * disputa no cuente) está en los componentes que renderizan.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./test/setup.ts'],
    include: ['test/**/*.test.{ts,tsx}'],
  },
  resolve: {
    alias: { '@': new URL('./src/', import.meta.url).pathname },
  },
});
