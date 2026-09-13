/**
 * Los datos del narrador.
 *
 * Son cuatro enlaces a perfiles reales de una persona. Lo que se prueba aquí no
 * es aritmética: es que ninguno se rompa en silencio. Un enlace mal escrito en
 * esta sección no falla, no avisa y no se nota hasta que alguien lo pulsa y
 * acaba en ningún sitio.
 */

import { describe, expect, it } from 'vitest';

import { channel, STREAMER } from '../src/lib/streamer.ts';

describe('canales del narrador', () => {
  it('están los cuatro, sin repetirse', () => {
    const ids = STREAMER.channels.map((entry) => entry.id);

    expect(ids).toEqual(['kick', 'youtube', 'instagram', 'tiktok']);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('todos los enlaces son https absolutos', () => {
    // Uno relativo o con http se abriría mal o lo bloquearía el navegador.
    for (const entry of STREAMER.channels) {
      expect(entry.url.startsWith('https://')).toBe(true);
      expect(() => new URL(entry.url)).not.toThrow();
    }
  });

  it('solo hay un canal principal, y es donde se emite', () => {
    /*
      El sitio enseña «Ver en {liveLabel}» y enlaza a `liveUrl`. Si hubiera dos
      principales, o si el principal no coincidiera con el enlace del directo,
      el botón llevaría a un sitio y la etiqueta diría otro.
    */
    const primary = STREAMER.channels.filter((entry) => entry.primary === true);

    expect(primary).toHaveLength(1);
    expect(primary[0]?.url).toBe(STREAMER.liveUrl);
    expect(primary[0]?.label).toBe(STREAMER.liveLabel);
  });

  it('cada canal dice a qué perfil lleva', () => {
    // El identificador visible tiene que estar dentro de la URL: es la forma
    // barata de detectar que alguien cambió uno y olvidó el otro.
    for (const entry of STREAMER.channels) {
      const handle = entry.handle.replace(/^@/, '').toLowerCase();
      expect(entry.url.toLowerCase()).toContain(handle);
    }
  });

  it('se puede pedir un canal por su identificador', () => {
    expect(channel('kick')?.url).toBe(STREAMER.liveUrl);
    expect(channel('youtube')?.label).toBe('YouTube');
  });

  it('no publica cifras de seguidores', () => {
    /*
      Envejecen en una semana y convierten una presentación en un boletín de
      resultados ajeno. Si alguien las añade, este test lo recuerda.
    */
    const serialized = JSON.stringify(STREAMER);

    expect(serialized).not.toMatch(/followers|seguidores|subscribers|suscriptores/i);
  });
});
