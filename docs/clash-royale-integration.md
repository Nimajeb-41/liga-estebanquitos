# Integración con Clash Royale

Cómo la plataforma consume datos reales del juego, y por qué esos datos **no
deciden nada** por su cuenta.

Todo lo que hay aquí se apoya en el [spike del 10 de septiembre de
2026](clash-royale-spike.md), ejecutado contra la API oficial con una batalla
amistosa real. Nada está supuesto.

## La idea, en una línea

> Clash Royale aporta **evidencia**. La liga sigue siendo la **fuente de verdad**
> del torneo.

Ver [ADR 0013](adr/0013-clash-royale-como-evidencia.md).

## El flujo completo

```
  Clash Royale API
        │  GET /players/{tag}/battlelog
        ▼
  ClashRoyaleClient          token, timeouts, 403, 429, reintentos
        │
        ▼
  normalizer.ts              lectura defensiva + huella determinista
        │
        ▼
  external_battles           tablas propias. NO tocan la competición
        │
        ▼
  matching.ts                candidatos, con motivos y ambigüedades
        │
        ▼
  battle_candidates          PENDING · NEEDS_REVIEW
        │
        ▼
  ┌───────────────────┐
  │  ADMINISTRADOR    │      confirma · rechaza · aparta
  └───────────────────┘
        │  (solo al confirmar)
        ▼
  recordResult()             el MISMO servicio que un resultado a mano
        │
        ▼
  dominio → puntuación → clasificación → auditoría
```

Ese recuadro no se puede saltar. No hay ninguna ruta, ninguna tarea programada y
ningún umbral de confianza que registre un resultado sin él.

## Piezas

```
apps/api/src/integrations/clash-royale/
├── types.ts        Formas reales de la API. Ni un campo inventado
├── client.ts       HTTP: token, validación de etiquetas, 403/429/5xx/timeout
├── normalizer.ts   Batalla cruda → forma estable + huella
└── matching.ts     Batalla + calendario → candidatos con confianza

apps/api/src/data/external-battles.ts     Consultas
apps/api/src/services/clash-royale.ts     Orquestación
apps/web/src/components/clash/            Mazos y evidencia pública
apps/web/src/components/admin/            Revisión de candidatos y vinculación
```

`client.ts`, `normalizer.ts` y `matching.ts` son **código puro o casi**: no
conocen la base de datos. Por eso se prueban en milisegundos y sin red.

## El cliente

- **Vive solo en el backend.** El token está ligado a las IP declaradas al
  crearlo, así que ni siquiera funcionaría desde un navegador; y aunque
  funcionase, exponerlo sería regalar la clave.
- **Valida la etiqueta antes de construir la URL.** `#ABC/battlelog` o
  `#../../clans` se rechazan sin llegar a salir. Hay tests.
- **Timeout** configurable, 8 s por defecto.
- **403** → mensaje que apunta a la causa más habitual: la IP no declarada.
  Ojo, un token mal escrito da el mismo 403; no se distinguen.
- **429** → respeta `Retry-After` si viene; si no, espera creciente. **No se
  asume ningún umbral**: los límites reales no están publicados y no se inventan.
- **5xx** y fallos de red → reintento con espera creciente y rendición limpia.

## Normalización

`battleTime` llega como `20260910T050249.000Z`, sin separadores. Se le devuelven.

Una batalla se descarta —contando el motivo, nunca en silencio— si:

| Motivo                | Por qué                                                                        |
| --------------------- | ------------------------------------------------------------------------------ |
| `MISSING_BATTLE_TIME` | Sin instante no hay ni fecha ni huella                                         |
| `NOT_ONE_VS_ONE`      | La liga es uno contra uno; en un 2v2 habría que adivinar quién es «el jugador» |
| `MISSING_TAG`         | Sin etiqueta no se sabe de quién es                                            |
| `MISSING_CROWNS`      | Sin coronas no hay marcador que proponer                                       |

Que falte el **mazo** no descarta nada: es contexto, no marcador.

## Deduplicación

La API **no da identificador de batalla**. Se buscó y no existe.

```
fingerprint = SHA-256( battleTime ISO | etiquetas ordenadas )
```

Detalle y limitaciones en [ADR 0014](adr/0014-huella-de-batalla.md). Lo esencial:

- La misma batalla desde los dos historiales da la misma huella. Verificado.
- Las coronas quedan fuera, para que una incoherencia se note en vez de
  duplicarse.
- Una huella repetida con datos distintos **no sobrescribe**: marca para revisión.
- No se afirma que las colisiones sean imposibles. Se afirma que no pasan
  desapercibidas.

## Detección de candidatos

Requisito duro: **las dos etiquetas vinculadas a los dos participantes** del
partido. Sin eso no hay candidato, y no se intenta adivinar por el nombre.

**Motivos** (suman confianza): `BOTH_PLAYERS_LINKED` · `FRIENDLY_BATTLE` ·
`WITHIN_TIME_WINDOW` · `MATCH_AWAITING_RESULT`.

**Ambigüedades** (restan, y se muestran): `NOT_A_FRIENDLY_BATTLE` ·
`OUTSIDE_TIME_WINDOW` · `MATCH_HAS_NO_SCHEDULE` · `MATCH_ALREADY_HAS_RESULT` ·
`MATCH_POSTPONED` · `MATCH_DISPUTED` · `MATCH_CANCELLED` ·
`MULTIPLE_MATCHES_POSSIBLE` · `ANOTHER_BATTLE_ALREADY_CONFIRMED` ·
`EQUAL_CROWNS`.

### La ambigüedad que importa: ida y vuelta

La misma pareja se enfrenta **dos veces** por temporada. Una batalla encaja en
los dos partidos. Si ninguno tiene fecha, no hay forma honesta de elegir: se
proponen **los dos**, marcados `MULTIPLE_MATCHES_POSSIBLE`, y decide una persona.
La ventana temporal los desempata cuando sí hay fechas.

### Sobre la confianza

Va de 0 a 100 y **no autoriza nada**. Ordena la cola. El botón de confirmar es el
mismo con un 100 que con un 40; hay un test que lo comprueba.

Cada candidato viaja con sus motivos. Un número que no se puede explicar no sirve
para decidir.

### La ventana temporal

`CLASH_ROYALE_MATCH_WINDOW_MINUTES`, 180 minutos por defecto. **No sale de
ninguna medición**: el spike no midió esto y no podía. Es un valor de operación,
para ajustar cuando la liga lleve jornadas jugadas y se vea cuánto se desvían de
su horario.

## Vinculación de cuentas

**Vincular no es verificar.** Ver [ADR 0015](adr/0015-vincular-no-es-verificar.md).

- Se comprueba que la cuenta **existe** y se guarda su nombre.
- **No** se comprueba que sea de esa persona: exigiría `verifytoken`, que
  Supercell no documenta.
- Toda vinculación queda `UNVERIFIED`. El código nunca asigna `VERIFIED`.
- **P-11 sigue abierta.**

El **Player Tag no es el nombre del jugador**. `display_name` manda en toda la
interfaz; el tag solo sirve para cruzar datos.

## Mazos y cartas

`GET /cards` devuelve `{ items, supportItems }`: **123 cartas** y las tropas de
torre aparte. Se guardan en `cards`, con `is_support` para distinguirlas.

Los mazos observados en cada batalla van a `external_battle_cards`, en su propia
tabla y **no** en `decks`/`deck_cards`. Dos razones:

1. `decks` cuelga de un participante de la liga; en una batalla externa las
   etiquetas pueden ser de cualquiera.
2. El registro de mazos de la liga tiene consecuencias normativas que dependen de
   **P-04**, sin decidir. Guardar lo observado aparte evita que un dato externo
   se confunda con un mazo declarado.

**P-04 no se cierra.** El sistema recopila y muestra; si se puede cambiar de mazo
entre partidas, si hay que declararlo antes, si hay cartas prohibidas — todo eso
sigue siendo una decisión de reglamento.

## Sincronización

**Se lanza a mano, a propósito.**

La frecuencia adecuada depende de cuánto conserva Clash Royale el historial, y de
eso solo se conoce la **cota inferior**: al menos 41,4 horas. Es más que el plazo
de impugnación de 24 h (R-06), lo cual es una buena noticia, pero fijar una
frecuencia oficial con una sola medición sería inventarse un dato.

Desde la Fase 4 el planificador está implementado
(`apps/api/src/integrations/clash-royale/scheduler.ts`) pero **arranca apagado**.
Cuando se encienda hace deliberadamente poco:

- Consulta **unos pocos** participantes por vuelta
  (`CLASH_ROYALE_SYNC_MAX_PLAYERS`, 3 por defecto), empezando por los que llevan
  más tiempo sin consultarse. La API oficial no publica sus límites de peticiones
  y el spike no los midió: se prefiere tardar en recorrer la plantilla a
  arriesgar un bloqueo a mitad de temporada.
- **No confirma nada.** Igual que la sincronización manual, deja candidatos en la
  cola de revisión. Ningún resultado oficial sale de ahí. En la auditoría el
  actor queda a `null`: lo hizo el sistema, y no se inventa un responsable.
- **Se corta sola** tras N fallos seguidos y espera un enfriamiento. Sin eso, un
  token caducado o una IP que cambió —que es lo que pasó durante la Fase 3—
  producirían un 403 por jugador y por vuelta, indefinidamente.

El cortacircuitos vive en memoria: si el proceso se reinicia, lo sensato es
volver a probar una vez, no heredar un bloqueo de la encarnación anterior.

Pedir `CLASH_ROYALE_SYNC_ENABLED=true` sin integración activa **impide el
arranque**: callárselo dejaría a alguien esperando datos que no van a llegar.

**Antes de encenderla**: medir la retención máxima con
`npm run clash:retention`, que registra observaciones a lo largo de días y da las
dos cotas. Mientras la superior siga «sin determinar», el intervalo sería un
número inventado.

## Endpoints

### Público

| Método | Ruta                           | Devuelve                                           |
| ------ | ------------------------------ | -------------------------------------------------- |
| GET    | `/api/v1/matches/:id/evidence` | Evidencia de un candidato **confirmado**, o `null` |

Una sospecha sin resolver no sale al público: se leería como resultado.

### Administración

| Método | Ruta                                         | Qué hace                                 |
| ------ | -------------------------------------------- | ---------------------------------------- |
| GET    | `/admin/clash-royale/links`                  | Vinculaciones de todos los participantes |
| POST   | `/admin/clash-royale/links/:id`              | Vincula una cuenta. Nace `UNVERIFIED`    |
| DELETE | `/admin/clash-royale/links/:id`              | Desvincula                               |
| POST   | `/admin/clash-royale/sync/:id`               | Trae el historial y propone candidatos   |
| POST   | `/admin/clash-royale/cards/sync`             | Sincroniza el catálogo                   |
| GET    | `/admin/clash-royale/candidates`             | Cola de revisión (`?status=`)            |
| POST   | `/admin/clash-royale/candidates/:id/confirm` | **Registra el resultado**                |
| POST   | `/admin/clash-royale/candidates/:id/reject`  | Descarta                                 |
| POST   | `/admin/clash-royale/candidates/:id/review`  | Aparta sin resolver                      |
| GET    | `/admin/clash-royale/sync`                   | Estado del planificador                  |
| POST   | `/admin/clash-royale/sync-run`               | Una vuelta completa, a mano              |

Todas dejan rastro en `audit_log`.

## Configuración

| Variable                                | Por defecto                      | Para qué                             |
| --------------------------------------- | -------------------------------- | ------------------------------------ |
| `CLASH_ROYALE_API_TOKEN`                | —                                | El token. **Nunca sale del backend** |
| `CLASH_ROYALE_API_BASE_URL`             | `https://api.clashroyale.com/v1` |                                      |
| `CLASH_ROYALE_ENABLED`                  | `true`                           | Sin token no se activa, se pida o no |
| `CLASH_ROYALE_TIMEOUT_MS`               | `8000`                           |                                      |
| `CLASH_ROYALE_MAX_RETRIES`              | `3`                              | Ante 429 y 5xx                       |
| `CLASH_ROYALE_MATCH_WINDOW_MINUTES`     | `180`                            | Margen temporal. **No medido**       |
| `CLASH_ROYALE_SYNC_ENABLED`             | `false`                          | Apagado hasta medir la retención     |
| `CLASH_ROYALE_SYNC_INTERVAL_MINUTES`    | `60`                             | Sin efecto mientras esté apagada     |
| `CLASH_ROYALE_SYNC_MAX_PLAYERS`         | `3`                              | Participantes por vuelta             |
| `CLASH_ROYALE_BREAKER_FAILURES`         | `3`                              | Fallos seguidos antes de cortar      |
| `CLASH_ROYALE_BREAKER_COOLDOWN_MINUTES` | `15`                             | Enfriamiento del cortacircuitos      |

## Seguridad

- **El token no sale del backend.** No se registra, no se serializa en ninguna
  respuesta, no aparece en `/health` —que solo dice `enabled`/`disabled`— y no
  está en ninguna fixture. Hay tests que lo comprueban en la URL y en los
  mensajes de error.
- `.env` está en `.gitignore`, y `evidence/` también: un historial real lleva
  etiquetas y nombres de terceros.
- **Las fixtures van seudonimizadas**, con las etiquetas y los nombres
  sustituidos por identificadores derivados por hash.
- **Validación de etiquetas** antes de construir cualquier URL, contra travesía
  de rutas y SSRF.
- Timeout, reintentos limitados y respeto del 429: no se bombardea la API.
- Toda la superficie administrativa exige sesión.

## Limitaciones que siguen ahí

1. **Sin identificador de batalla.** La huella no garantiza ausencia de
   colisiones, solo que no pasan desapercibidas.
2. **Retención solo acotada por abajo** (≥ 41,4 h). Falta la cota superior.
3. **Límites de peticiones no publicados.** No se asume ninguno.
4. **Token ligado a IP.** Desarrollo y producción necesitan tokens distintos, o
   una IP de salida fija. Un despliegue con IP dinámica rompe la integración y el
   síntoma es un 403 indistinguible de un token mal escrito.
5. **No hay verificación de propiedad de cuenta.** P-11.
6. **Nunca se observó un 2v2.** El normalizador los descarta; si algún día
   apareciera uno relevante, habría que decidir qué hacer.
7. **`isHostedMatch` no sirve** para identificar amistosas: la del spike vino en
   `false`. El discriminador es `type`.

## Reglas pendientes

Ninguna se cierra con esta integración.

| Regla    | Qué recibe, y qué sigue sin decidirse                                                         |
| -------- | --------------------------------------------------------------------------------------------- |
| **P-01** | Nada cambia. El walkover se sigue rechazando                                                  |
| **P-03** | Se observaron coronas de 0 a 3, máximo 3. Una muestra no cierra el formato                    |
| **P-04** | Se guardan y se muestran los mazos, y `deckSelection`. Las reglas sobre mazos siguen abiertas |
| **P-10** | Confirmar un candidato deja auditoría, como cualquier resultado                               |
| **P-11** | La vinculación funciona; la verificación de propiedad, no                                     |

## Referencias

- [clash-royale-spike.md](clash-royale-spike.md) — la evidencia.
- [clash-royale-api.md](clash-royale-api.md) — investigación de la Fase 0.
- [ADR 0013](adr/0013-clash-royale-como-evidencia.md) · [ADR 0014](adr/0014-huella-de-batalla.md) · [ADR 0015](adr/0015-vincular-no-es-verificar.md)
