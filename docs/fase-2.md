# Fase 2 — Interfaz pública y panel

**Estado: completada.**

Objetivo: que la liga se pueda seguir y compartir. Se construye `apps/web`
—Astro con renderizado en servidor, React donde hay interacción, Tailwind y
GSAP— y se sustituye el panel provisional de la Fase 1.

## Qué hay ahora

| Pieza                            | Estado                                          |
| -------------------------------- | ----------------------------------------------- |
| Sitio público con las 12 páginas | Funcionando                                     |
| Match Center                     | Funcionando, con sondeo en directo              |
| Panel de administración          | Funcionando, en Astro                           |
| Sistema de diseño                | Implementado                                    |
| Cliente de API validado          | Implementado                                    |
| Integración con Clash Royale     | Arquitectura lista, **sin activar**             |
| Reglas pendientes                | Las once siguen abiertas, y la interfaz lo dice |

**333 tests en verde**: 178 de dominio, 12 de esquema, 81 de la API y 62 del
frontend. Más 56 comprobaciones de extremo a extremo (`npm run e2e`).

## Páginas

### Públicas

| Ruta              | Qué muestra                                                    |
| ----------------- | -------------------------------------------------------------- |
| `/`               | Portada: estado, resumen, lo que se juega ahora, top 5, trofeo |
| `/clasificacion`  | Tabla completa, con corte por jornada (`?jornada=N`)           |
| `/calendario`     | Las 18 jornadas desplegables                                   |
| `/jornadas`       | Rejilla de jornadas con su estado                              |
| `/jornadas/[n]`   | Una jornada: sus partidos y su recuento                        |
| `/partidos`       | Todos, con filtros por estado y jornada                        |
| `/partidos/[id]`  | **Match Center**                                               |
| `/jugadores`      | Las 10 plazas; las libres como huecos declarados               |
| `/jugadores/[id]` | Ficha: números, forma, sanciones, partidos, mazo, Clash Royale |
| `/estadisticas`   | Líderes por métrica y métricas no disponibles                  |
| `/sanciones`      | Vigentes y anuladas                                            |
| `/reglamento`     | R-01..R-08 decididas, P-01..P-11 pendientes                    |
| `/sobre-la-liga`  | Qué es esto y cómo funciona por dentro                         |

Más `/404`, `/robots.txt` y `/sitemap.xml`, este último generado con los partidos
y jugadores que existen de verdad.

### Panel

`/admin` · `/admin/players` · `/admin/fixtures` · `/admin/matches` ·
`/admin/matches/[id]` · `/admin/standings` · `/admin/sanctions` ·
`/admin/rules` · `/admin/audit` · `/admin/login`

## Match Center

La pantalla más importante de la fase, y la que concentra las reglas que no
pueden fallar:

- un **aplazado** conserva su jornada y su fecha original, no puntúa, no suma
  coronas y no cuenta como jugado. No se presenta como derrota, y no enseña
  marcador aunque hubiera un resultado guardado: manda el estado;
- un resultado **en disputa** no es definitivo y no cuenta en la clasificación;
- si el reglamento no define los puntos —una incomparecencia, P-01— se dice, con
  el aviso de regla pendiente. No se inventa un número;
- el historial cuenta cada aplazamiento y cada corrección.

### En directo

La plataforma **no recibe coronas batalla a batalla**. Con el partido en `LIVE`,
la pantalla dice «Esperando datos en vivo» y explica por qué; en cuanto se
registra el resultado, aparece. No se finge un marcador.

El sondeo va contra el propio servidor, se detiene cuando el partido deja de
estar en juego, se pausa con la pestaña oculta y avisa tras tres fallos
seguidos.

## Cambios en el backend

Cuatro, y ninguno toca las reglas de competición:

1. **Ficha de partido con dos proyecciones** ([ADR 0012](adr/0012-ficha-publica-de-partido.md)).
   La pública ya no expone reportes, evidencia, notas de aplazamiento ni motivos
   de corrección. Nace `GET /api/v1/admin/matches/:id`.
2. **`allowedTransitions` en el torneo.** El panel ofrece exactamente los
   estados a los que el dominio permite pasar.
3. **`actions` en la ficha administrativa.** Igual, para cada partido.
4. **`SESSION_COOKIE` en el contrato.** La conocen los dos extremos; ahora está
   definida una sola vez.

Y una corrección de comportamiento en el frontend que vale la pena registrar:
las variables de entorno se leen de `process.env` en el servidor. Astro resuelve
`import.meta.env` al compilar, así que leyendo solo de ahí la misma build no se
podría desplegar contra otra API. Lo encontró `npm run e2e`.

## Reglas pendientes en la interfaz

Las once siguen abiertas. Ninguna se cierra desde una pantalla.

| Regla | Dónde se nota                                                                                            |
| ----- | -------------------------------------------------------------------------------------------------------- |
| P-01  | Puntos `null` en el Match Center; aviso al elegir incomparecencia; métrica no disponible en estadísticas |
| P-03  | El marcador dibuja 3 coronas como máximo, que es lo que asume el motor                                   |
| P-04  | «Mazo no disponible», con el motivo                                                                      |
| P-07  | El panel no distingue roles: hace lo que el backend permite                                              |
| P-09  | Empate sin resolver marcado en la tabla, con explicación                                                 |
| P-10  | Se publica que hubo corrección, no su motivo                                                             |
| P-11  | El reporte de un jugador lo introduce administración                                                     |

## Levantarlo

```bash
npm install
```

```bash
npm run demo
```

En otra terminal:

```bash
npm run web:dev
```

- Sitio: `http://127.0.0.1:4321`
- Panel: `http://127.0.0.1:4321/admin`
- Usuario: `admin@liga-estabanquitos.local` · clave `demo-liga-estabanquitos`

El servidor de demostración levanta la API con datos en memoria y un escenario
con partidos de todos los estados, **marcados como demostración**. Se pierden al
parar el proceso.

Guía completa en [development.md](development.md).

## Lo que no entra en esta fase

- Llamadas reales a la API de Clash Royale. La arquitectura está lista; la
  integración empieza en la Fase 3, y empieza por el spike.
- WebSockets. REST con sondeo es suficiente para un partido.
- PWA. La arquitectura queda limpia para añadirla, pero no se añade.
- Cerrar ninguna de las once reglas pendientes.
