# ADR 0011 — El panel pasa a Astro, con la sesión reenviada por el servidor

**Estado:** aceptada · 2026-09-08 · sustituye a
[ADR 0008](0008-panel-servido-por-la-api.md)

## Contexto

La [ADR 0008](0008-panel-servido-por-la-api.md) decidió servir el panel desde la
propia API como HTML sin JavaScript. Fue la decisión correcta para la Fase 1:
evitaba montar una segunda infraestructura para pantallas que son formularios, y
dejaba escrito que «el panel se puede sustituir entonces sin tocar el backend».

La Fase 2 construye el frontend. Ahora existe el proceso de Astro, existe el
sistema de diseño y existe un cliente de API tipado contra el contrato. Mantener
dos paneles significaría dos sitios donde arreglar cada cosa.

Queda un problema real que la Fase 1 no tuvo que resolver: **la API y el
frontend son dos orígenes distintos**. La cookie de sesión la emite la API, y
hacer que el navegador hable directamente con ella obligaría a CORS con
credenciales, a exponer la URL de la API y a depender de que el navegador
comparta cookies entre puertos.

## Decisión

El panel se construye en `apps/web` como páginas Astro con islas de React, y
**el servidor de Astro hace de puente hacia la API**:

- el navegador solo habla con el origen del frontend;
- Astro guarda la cookie que emitió la API y la reenvía en cada llamada;
- las operaciones administrativas pasan por `/api/admin/[...path]`, que solo
  compone rutas bajo `/api/v1/admin/`, exige `Origin` propio y responde 401 sin
  sesión.

El acceso es un `<form>` normal que responde con una redirección: funciona sin
JavaScript. Las operaciones sí lo usan, a cambio de errores en línea y de no
recargar la pantalla entera durante una jornada.

**El panel servido por la API se conserva** como respaldo: funciona con
`script-src 'none'` y sin el proceso del frontend, que es exactamente lo que hace
falta si el frontend está caído en mitad de una jornada. No es la interfaz
oficial y no recibe funcionalidad nueva.

## Alternativas descartadas

- **El navegador llama a la API directamente.** Obliga a CORS con credenciales,
  publica la URL de la API y hace depender la sesión de que el navegador
  comparta cookies entre puertos del mismo host. Frágil justo en la parte que no
  puede fallar.
- **Un token en `localStorage`.** Cualquier XSS se lo lleva. La cookie
  `httpOnly` no.
- **Borrar el panel de la API.** Se pierde el respaldo sin JavaScript por ahorrar
  mil líneas que ya funcionan y ya están escritas.
- **Duplicar el panel en Astro sin puente, con formularios contra la API.** El
  `SameSite=Lax` de la cookie bloquearía los envíos cruzados, que es justo lo que
  tiene que hacer.

## Consecuencias

- Una sola interfaz administrativa que mantener y un solo sistema de diseño.
- La sesión sigue siendo `httpOnly` en los dos saltos. No hay token al alcance de
  JavaScript en ningún momento.
- La API puede vivir en una red interna: solo el frontend necesita alcanzarla.
- Astro reenvía la IP del visitante en `x-forwarded-for`. Sin eso, el límite de
  diez intentos de acceso por cinco minutos sería común a todo el mundo: diez
  fallos de cualquiera dejarían fuera al resto.
- **Coste asumido**: el frontend se convierte en un punto más que puede caer, y
  el puente es código que hay que mantener honesto. Por eso está probado en
  `scripts/e2e.mjs`: 401 sin sesión, 403 desde otro origen, 404 ante un intento
  de salirse de `/admin`.
