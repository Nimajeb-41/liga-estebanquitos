# Panel de administración

Desde la Fase 2 el panel oficial vive en el frontend: `apps/web`, ruta `/admin`.
El que servía la propia API se conserva como respaldo.

| Panel                       | Dónde                         | Cuándo usarlo                                     |
| --------------------------- | ----------------------------- | ------------------------------------------------- |
| **Oficial** (Astro + React) | `http://127.0.0.1:4321/admin` | Siempre                                           |
| Respaldo (HTML sin JS)      | `http://127.0.0.1:3000/admin` | Si el frontend está caído en mitad de una jornada |

Los dos llaman a los mismos servicios, así que no hay dos caminos con reglas
distintas. El de respaldo no recibe funcionalidad nueva.

Ver [ADR 0011](adr/0011-panel-en-astro-con-bff.md), que sustituye a la
[ADR 0008](adr/0008-panel-servido-por-la-api.md).

## Cómo está hecho el panel oficial

Páginas Astro renderizadas en el servidor, con islas de React solo donde hay
interacción. **El navegador nunca habla con la API**: habla con el servidor de
Astro, que reenvía la operación añadiendo la cookie de sesión. Así el token
sigue siendo `httpOnly` y no hace falta CORS con credenciales.

El acceso es un `<form>` normal y funciona sin JavaScript. Las operaciones sí lo
usan, a cambio de errores en línea y de no recargar la pantalla entera.

**Ninguna pantalla comprueba reglas de competición.** Las acciones que se ofrecen
salen de lo que declara el backend (`allowedTransitions`, `actions`), y si una
operación se rechaza, se muestra el motivo tal cual. Duplicar el reglamento en
React garantizaría que tarde o temprano dijeran cosas distintas.

## Pantallas

| Ruta                  | Qué hace                                                                   |
| --------------------- | -------------------------------------------------------------------------- |
| `/admin`              | Estado del torneo, lo que requiere atención, actividad reciente            |
| `/admin/players`      | Alta, edición, confirmación con plaza, retirada, borrado                   |
| `/admin/fixtures`     | Generar el calendario con semilla; ver las 18 jornadas                     |
| `/admin/matches`      | Listado con filtros por estado, jornada y jugador                          |
| `/admin/matches/[id]` | Resultado, reporte, corrección, directo, aplazamiento, fecha               |
| `/admin/standings`    | La misma tabla que ve el público. No se edita, y no va a editarse          |
| `/admin/sanctions`    | Registrar y anular                                                         |
| `/admin/rules`        | Configuración vigente y reglas pendientes. Solo lectura                    |
| `/admin/clash-royale` | Cuentas vinculadas y cola de candidatos a resultado. Nada se confirma solo |
| `/admin/audit`        | Quién hizo qué, cuándo y con qué datos                                     |

## Entrar

`/admin/login`, con el correo y la contraseña del administrador creado por el
seed. La sesión dura 12 horas (`SESSION_TTL_HOURS`) y se cierra con **Cerrar
sesión**.

## Resumen · `/admin`

Estado del torneo, confirmados sobre el cupo, partidos totales, jugados, en
directo, pospuestos, en disputa y sanciones activas. Debajo: próximos partidos,
pospuestos y en disputa, cada uno enlazando a su ficha.

Los botones de cambio de estado salen de `allowedTransitions`, que declara el
dominio: solo se ofrecen las transiciones posibles desde el estado actual. El
paso de `READY` a `SCHEDULED` lo produce **generar el calendario**, no un cambio
de estado suelto.

## Participantes · `/admin/players`

- Las **10 plazas** con su ocupante o `TBD / POR CONFIRMAR`.
- La plantilla completa con estado y plaza.
- Alta, confirmación, desconfirmación, retirada, baja y **sustitución**.

Con el calendario ya publicado la plantilla se bloquea y el panel lo dice: a
partir de ahí solo cabe sustituir, y solo si el saliente no ha jugado todavía
(P-05 sin decidir, y el plazo para sustituir es P-06; ver
[pending-rules.md](pending-rules.md)).

## Calendario · `/admin/fixtures`

Antes de generar: cuántos confirmados hay, qué estado hace falta y un campo
opcional de **semilla**. Indicar la semilla permite reproducir el sorteo después
y demostrar que no se repitió hasta que saliera algo conveniente.

Después: las 18 jornadas con sus 5 partidos, estado de cada uno y, si está
pospuesto, el aviso `POSPUESTO` junto a su fecha original.

## Partido · `/admin/matches/:id`

- Jugadores, jornada, estado, fecha vigente y **fecha original**.
- Fijar la fecha prevista.
- Marcar **en directo**, con URL de transmisión.
- **Posponer**: motivo (obligatorio), explicación y fecha propuesta opcional.
- **Reprogramar**: nueva fecha y explicación.
- **Registrar resultado**: coronas de cada jugador.
- **Reporte de un jugador**: se indica de quién es el reporte. Si los dos
  coinciden, el resultado queda validado; si se contradicen, el partido pasa a
  `DISPUTED`.
- **Corregir resultado** (solo si ya hay uno): exige motivo y crea una revisión.
- **Historial**: aplazamientos, reprogramaciones y revisiones, con sus fechas.

## Clasificación · `/admin/standings`

POS · JUGADOR · PJ · VG · VP · V3C · CF · CC · DC · SAN · PTS, con los criterios
de desempate aplicados y el aviso `empate` cuando dos jugadores comparten
posición porque ningún criterio los separa.

**No es editable y no existe endpoint para editarla.** Para cambiar la tabla hay
que cambiar un resultado o una sanción.

## Sanciones · `/admin/sanctions`

Registrar una sanción (jugador, tipo, penalización —por defecto −2—, motivo y
evidencia opcional) y anular una existente indicando por qué. Anular no borra:
la sanción queda como `REVOKED` con su motivo.

## Auditoría · `/admin/audit`

Las últimas 200 acciones con efecto sobre la competición: qué se hizo, sobre qué
entidad, quién y cuándo, con el detalle en JSON. Es lo que permite responder
"¿por qué esta tabla tiene estos puntos?".

## Seguridad del panel

- Todas las páginas salvo el acceso exigen sesión; sin ella redirigen al acceso
  conservando el destino.
- La cookie es `httpOnly` y `SameSite=Lax` en los dos saltos —de la API al
  servidor de Astro, y de ahí al navegador— y `secure` en producción. El token
  no está al alcance de JavaScript en ningún momento, y no pasa por
  `localStorage`.
- Las operaciones administrativas van por `/api/admin/[...path]`, que solo
  compone rutas bajo `/api/v1/admin/`, exige `Origin` propio y responde 401 sin
  sesión. Está probado en `npm run e2e`.
- El acceso está limitado a 10 intentos cada 5 minutos, **por IP**: el servidor
  de Astro reenvía la del visitante.
- Nada bajo `/admin` se cachea (`Cache-Control: no-store`), y queda fuera de
  `robots.txt` y del sitemap.
- Todo el texto que viene de la base de datos se escapa antes de renderizarse.
