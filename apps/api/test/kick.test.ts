/**
 * Estado del canal de Kick.
 *
 * Lo que se prueba aqui no es que sepa leer JSON: es que **no mienta cuando no
 * sabe**. La API publica de Kick no esta documentada y puede cambiar; si ese
 * dia el sitio dijera «no hay directo» en vez de «no se pudo comprobar», estaria
 * afirmando algo que nadie ha verificado.
 */

import { describe, expect, it, vi } from 'vitest';

import { KickClient } from '../src/integrations/kick/client.ts';

/** Una respuesta de Kick de mentira. */
function respond(body: unknown, status = 200): typeof fetch {
  return vi.fn(
    async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
  ) as unknown as typeof fetch;
}

const client = (fetchImpl: typeof fetch, cacheSeconds = 0) =>
  new KickClient({ slug: 'canal', fetchImpl, cacheSeconds });

describe('canal de Kick', () => {
  it('fuera de linea es un hecho, no una suposicion', async () => {
    // `livestream: null` es la respuesta de Kick para «no esta emitiendo».
    const status = await client(respond({ livestream: null })).status();

    expect(status.state).toBe('OFFLINE');
    expect(status.playingClashRoyale).toBe(false);
  });

  it('en directo con Clash Royale', async () => {
    const status = await client(
      respond({
        livestream: {
          session_title: 'Liga Estabanquitos · Jornada 4',
          categories: [{ name: 'Clash Royale', slug: 'Clash-Royale' }],
          start_time: '2026-10-10T20:00:00Z',
        },
      }),
    ).status();

    expect(status.state).toBe('LIVE');
    expect(status.playingClashRoyale).toBe(true);
    expect(status.category).toBe('Clash Royale');
    expect(status.title).toBe('Liga Estabanquitos · Jornada 4');
  });

  it('en directo con otro juego no es la liga', async () => {
    const status = await client(
      respond({ livestream: { categories: [{ name: 'Fortnite', slug: 'fortnite' }] } }),
    ).status();

    expect(status.state).toBe('LIVE');
    expect(status.playingClashRoyale).toBe(false);
  });

  it('reconoce la categoria aunque cambie la forma de escribirla', async () => {
    // Kick escribe el slug con mayusculas inconsistentes (`Clash-Royale`).
    for (const category of ['Clash Royale', 'clash-royale', 'CLASH ROYALE', 'ClashRoyale']) {
      const status = await client(
        respond({ livestream: { categories: [{ name: category }] } }),
      ).status();
      expect(status.playingClashRoyale).toBe(true);
    }
  });

  it('una forma que no se reconoce es «no lo se», no «apagado»', async () => {
    /*
      La diferencia es la que importa de todo este archivo. Si Kick cambia la
      forma del JSON, la web tiene que decir que no puede comprobarlo, no
      afirmar que nadie esta emitiendo.
    */
    const status = await client(respond({ data: { something: 'else' } })).status();

    expect(status.state).toBe('UNKNOWN');
    expect(status.reason).not.toBeNull();
  });

  it('un error de red tampoco es «apagado»', async () => {
    const boom = vi.fn(async () => {
      throw new Error('sin red');
    }) as unknown as typeof fetch;

    const status = await client(boom).status();

    expect(status.state).toBe('UNKNOWN');
  });

  it('un 403 tampoco', async () => {
    const status = await client(respond({}, 403)).status();
    expect(status.state).toBe('UNKNOWN');
  });

  it('no vuelve a preguntar mientras la respuesta siga fresca', async () => {
    // Cada visita a la portada consulta esto: sin cache serian miles de
    // llamadas a un servicio ajeno.
    const spy = vi.fn(
      async () => new Response(JSON.stringify({ livestream: null }), { status: 200 }),
    ) as unknown as typeof fetch;
    const kick = new KickClient({ slug: 'canal', fetchImpl: spy, cacheSeconds: 60 });

    await kick.status();
    await kick.status();
    await kick.status();

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('tras varios fallos deja de insistir un rato', async () => {
    const boom = vi.fn(async () => {
      throw new Error('caido');
    }) as unknown as typeof fetch;
    const kick = new KickClient({
      slug: 'canal',
      fetchImpl: boom,
      cacheSeconds: 0,
      breakerFailures: 2,
      breakerCooldownSeconds: 600,
    });

    await kick.status();
    await kick.status();
    // El cortafuegos ya esta abierto: esta no deberia llamar.
    await kick.status();

    expect(boom).toHaveBeenCalledTimes(2);
  });

  it('mientras el cortafuegos esta abierto devuelve lo ultimo que supo', async () => {
    let ok = true;
    const flaky = vi.fn(async () => {
      if (!ok) throw new Error('caido');
      return new Response(
        JSON.stringify({ livestream: { categories: [{ name: 'Clash Royale' }] } }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    const kick = new KickClient({
      slug: 'canal',
      fetchImpl: flaky,
      cacheSeconds: 0,
      breakerFailures: 1,
      breakerCooldownSeconds: 600,
    });

    const first = await kick.status();
    expect(first.state).toBe('LIVE');

    ok = false;
    const second = await kick.status();

    // Es viejo, pero es informacion. Inventar OFFLINE seria afirmar algo que no
    // se ha comprobado.
    expect(second.state).toBe('LIVE');
  });
});
