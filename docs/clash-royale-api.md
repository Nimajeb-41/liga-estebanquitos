# API oficial de Clash Royale

Investigación realizada el **8 de septiembre de 2026**. Este documento separa de
forma explícita lo que se pudo verificar de lo que no. Nada de lo que aparece
aquí como capacidad de la API está inventado; lo que no se pudo comprobar está
marcado como tal.

## Resumen para decidir

La API oficial sirve para **enriquecer** la liga (verificar identidades,
mostrar mazos, ilustrar el historial), pero **no para arbitrarla**. La carga de
resultados seguirá siendo manual y validada por la administración. El motivo
principal es que no se ha podido confirmar que las batallas amistosas —el modo
en el que se juega una liga privada— aparezcan en el historial que expone la
API.

## Lo verificado

### Portal y autenticación

- El portal de desarrolladores es **developer.clashroyale.com** y la API se
  consume en **`https://api.clashroyale.com/v1`**.
- La documentación completa está **detrás de inicio de sesión**: al autenticarse,
  el portal entrega una `swaggerUrl` y un token temporal y muestra el Swagger
  dentro de un iframe. Comprobado inspeccionando el propio portal.
- Autenticación por cabecera: `Authorization: Bearer <token>`.
- Una llamada sin token responde **403** (comprobado contra
  `GET /v1/cards`).
- **Cada token está ligado a una lista de IP permitidas** que se declara al
  crearlo. Esta es la restricción operativa más importante del proyecto.

### Endpoints documentados

Lista obtenida de un espejo público de la especificación oficial y contrastada
con clientes mantenidos. Es una **instantánea**: el catálogo puede haber crecido
desde entonces, y solo el Swagger oficial tras iniciar sesión es autoritativo.

| Endpoint                                                | Devuelve                                  |
| ------------------------------------------------------- | ----------------------------------------- |
| `GET /players/{playerTag}`                              | Perfil del jugador                        |
| `GET /players/{playerTag}/battlelog`                    | Batallas recientes                        |
| `GET /players/{playerTag}/upcomingchests`               | Ciclo de cofres                           |
| `POST /players/{playerTag}/verifytoken`                 | **No documentado.** Ver el aviso de abajo |
| `GET /clans`                                            | Búsqueda de clanes                        |
| `GET /clans/{clanTag}`                                  | Detalle del clan                          |
| `GET /clans/{clanTag}/members`                          | Miembros                                  |
| `GET /clans/{clanTag}/warlog`                           | Historial de guerras                      |
| `GET /clans/{clanTag}/currentwar`                       | Guerra en curso                           |
| `GET /tournaments`                                      | Búsqueda de torneos **del juego**         |
| `GET /tournaments/{tournamentTag}`                      | Detalle de un torneo del juego            |
| `GET /cards`                                            | Catálogo de cartas                        |
| `GET /locations` · `/locations/{id}`                    | Países y regiones                         |
| `GET /locations/{id}/rankings/players\|clans\|clanwars` | Rankings                                  |

### Datos de una batalla

Cada entrada del `battlelog` incluye:

- `type` (tipo de batalla), `battleTime`, `arena`, `gameMode { id, name }`,
  `deckSelection`.
- `team[]` y `opponent[]`, y en cada uno: `tag`, `name`, `startingTrophies`,
  `trophyChange`, **`crowns`**, `clan` y **`cards[]`** con `name`, `level`,
  `maxLevel` e `iconUrls.medium`.

Es decir: **coronas y mazo completo de ambos lados están disponibles** para las
batallas que la API devuelva.

### Límites

- La API define la respuesta **429 `RequestThrottled`**: "la petición fue
  limitada porque la cantidad de peticiones superó el umbral definido para el
  token".
- **Los números concretos del límite no están publicados.** No se ha encontrado
  ninguna fuente oficial que los indique, así que no se asume ninguno: el
  cliente respetará el 429 con reintento y espera exponencial.

## Lo NO verificado

| Duda                                                                               | Estado                                                                                                 | Impacto                                                      |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| ¿Aparecen las **batallas amistosas** en el `battlelog`, y con qué valor de `type`? | **Sin verificar.** No se encontró documentación oficial ni fuente fiable                               | **Alto**: decide si se pueden importar resultados de la liga |
| Cuántas batallas devuelve el `battlelog`                                           | La comunidad repite "las 25 últimas"; no hay confirmación oficial                                      | Alto: obliga a consultar poco después de cada jornada        |
| Cuánto tiempo se conservan las batallas                                            | Sin verificar                                                                                          | Alto: si es corto, no hay margen para reclamaciones tardías  |
| Límites numéricos de peticiones                                                    | No publicados                                                                                          | Medio                                                        |
| Endpoints nuevos (leaderboards, Path of Legends, torneos globales)                 | Un cliente mantenido expone un método de _leaderboards_, pero no se pudo confirmar el endpoint oficial | Bajo                                                         |

**Cómo resolverlo:** crear una cuenta en el portal, generar un token con la IP
del servidor y hacer un _spike_ de una tarde: jugar una amistosa entre dos
cuentas de prueba y consultar el `battlelog` de ambas. Es media hora de trabajo
y despeja las tres dudas de impacto alto a la vez. Hasta entonces, la
integración se diseña como **opcional**.

## Lo que la API no ofrece

- **No hay webhooks ni notificaciones push.** Todo es consulta activa
  (_polling_).
- **No permite crear ni gestionar torneos privados.** `/tournaments` consulta
  los torneos del propio juego; no sirve para organizar esta liga.
- **No expone partidas en tiempo real.** Se consulta el historial una vez la
  batalla ha terminado.
- **No identifica a las personas**, solo a las cuentas. Vincular una cuenta con
  un participante es cosa nuestra.

### Aviso sobre `verifytoken` — corregido el 9 de septiembre de 2026

Este documento lo listó en su día entre los endpoints documentados. **No lo
está.** El portal de desarrolladores no incluye ningún endpoint de verificación
de cuenta, y hay peticiones abiertas de la comunidad para que Supercell lo
documente.

`POST /players/{playerTag}/verifytoken` existe y lo usan servicios de terceros,
pero como **capacidad no oficial y sin garantía**: puede cambiar o desaparecer
sin aviso y sin ruta de migración.

Consecuencia práctica: **P-11 no puede apoyarse en él sin una decisión explícita
del administrador**, que asuma ese riesgo a sabiendas. Mientras esa decisión no
exista, el flujo de identidad no se implementa. Ver
[clash-royale-spike.md](clash-royale-spike.md).

## Arquitectura de la integración

```
API de Clash Royale
        │  (solo el backend, con el token en variables de entorno)
        ▼
     Backend  ──►  PostgreSQL  ──►  API interna  ──►  Frontend
```

Reglas no negociables:

1. **La API key jamás llega al navegador.** El frontend habla únicamente con
   nuestra API.
2. Todo lo que venga de Supercell se guarda en nuestra base de datos; el
   frontend nunca consulta a Supercell directamente.
3. Nada importado desde la API se convierte en resultado oficial sin que un
   administrador lo confirme. La API **propone**, la administración **dispone**.

### La restricción de la IP

El token solo funciona desde las IP declaradas. Consecuencias:

- En desarrollo hay que registrar la IP pública de casa, que puede cambiar.
- En producción hace falta un servidor con IP estable (VPS, o un proveedor que
  la garantice). Las plataformas _serverless_ con IP de salida variable no
  sirven sin una pasarela intermedia.
- Existen servicios comunitarios que actúan de proxy con IP fija; si se
  considera esa vía, hay que evaluar antes su fiabilidad y sus condiciones.

Decisión para la Fase 3: un único proceso del backend, con IP fija, es el que
habla con Supercell.

## Usos previstos, por orden de valor

| Fase | Uso                                                                                       | Depende de                                    |
| ---- | ----------------------------------------------------------------------------------------- | --------------------------------------------- |
| 3    | **Verificar la identidad** con `verifytoken`                                              | Decisión sobre usar una capacidad no oficial  |
| 3    | **Sincronizar el catálogo de cartas** desde `/cards`                                      | Nada pendiente                                |
| 3    | **Mostrar el mazo** usado en cada partido                                                 | Que las amistosas aparezcan en el `battlelog` |
| 4    | **Proponer resultados** cruzando el `battlelog` de los 10 participantes con el calendario | Lo mismo, más la ventana de retención         |
| 4    | Estadísticas de cartas más usadas de la liga                                              | Lo mismo                                      |

El modelo de datos ya está preparado: `players.clash_tag` y
`players.clash_tag_verified_at`, y las tablas `cards`, `decks` y `deck_cards`
con `source = 'CLASH_API'` para distinguir lo importado de lo cargado a mano.

## Fuentes

- [Portal oficial de desarrolladores](https://developer.clashroyale.com/)
- [RoyaleAPI — documentación para desarrolladores](https://docs.royaleapi.com/)
- [Espejo público de la especificación Swagger de la API](https://gist.github.com/loganlinn/d813ba0f9ccb47f34462ec8abeab8e14)
- [Cliente Python `clashroyale` — referencia de la API](https://clashroyale.readthedocs.io/en/latest/api.html)
- [Tipos TypeScript de la API](https://github.com/DTrombett/royale-api-types)
