# ADR 0008 — El panel de administración lo sirve la API

**Estado:** sustituida por [ADR 0011](0011-panel-en-astro-con-bff.md) ·
2026-09-08

> El panel oficial pasa a `apps/web`. El que describe esta ADR se conserva como
> respaldo sin JavaScript, para poder administrar la liga si el frontend está
> caído, pero ya no recibe funcionalidad nueva.

## Contexto

La Fase 1 necesita un `/admin` funcional, pero explícitamente **no** la interfaz
pública definitiva. La arquitectura documentada reserva `apps/web` para Astro +
React con el tema cyberpunk, que llega en la Fase 2.

Montar ya el panel en Astro obligaría a resolver ahora cosas que no aportan
nada a esta fase: build separado, adaptador de servidor, propagación de la
cookie de sesión entre dos procesos, CORS entre ellos y un bundle de cliente
para pantallas que son formularios.

## Decisión

El panel se sirve desde `apps/api` como HTML renderizado en servidor, con
formularios normales (POST + redirección) y **sin JavaScript**.

Las páginas llaman a los mismos servicios que los endpoints REST: no hay dos
implementaciones de la misma regla. Los colores son ya los tokens del tema
cyberpunk, declarados como variables CSS en un único archivo.

## Alternativas descartadas

- **Panel en Astro ahora.** Duplica la infraestructura para pantallas que son
  formularios, y obliga a decidir en la Fase 1 cosas de la Fase 2.
- **SPA en React dentro de la API.** Un bundle de cliente y estado que mantener
  para un CRUD que el navegador ya sabe hacer con `<form>`.
- **Solo API, sin panel.** Administrar una liga con `curl` durante una
  transmisión no es realista.

## Consecuencias

- El panel funciona con `script-src 'none'`: la superficie de ataque por
  JavaScript es cero.
- Carga instantánea en un móvil con mala conexión, que es como se va a usar
  durante las jornadas.
- No hay lógica de competición duplicada entre panel y API.
- **Coste asumido**: la interacción es la de un sitio web clásico (recargas
  completas, sin actualización en vivo). Para el uso administrativo es
  suficiente; la experiencia rica es de la Fase 2, y el panel se puede sustituir
  entonces sin tocar el backend.
