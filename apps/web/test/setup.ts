import '@testing-library/jest-dom/vitest';

import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

/**
 * jsdom no trae `matchMedia`.
 *
 * Varios componentes preguntan por `prefers-reduced-motion` antes de animar.
 * Se responde que no —o sea, que sí se anima—, que es el camino con más código
 * por cubrir: el que respeta la preferencia se limita a dejar las cosas en su
 * sitio, y los tests que lo necesiten pueden sobrescribir esto.
 */
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}

afterEach(() => {
  cleanup();
});
