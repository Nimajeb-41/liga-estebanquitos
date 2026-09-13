# Spike de la API de Clash Royale

Experimento controlado para cerrar con evidencia las dudas que
[clash-royale-api.md](clash-royale-api.md) dejó abiertas en la Fase 0.

> **Estado: EJECUTADO el 10 de septiembre de 2026, 05:14 UTC.**
> Batalla amistosa real entre dos cuentas, consultada desde los dos historiales.
> Todo lo que sigue son datos observados, no supuestos.

Este documento tiene tres estados y no se mezclan nunca:

| Marca             | Significa                                                          |
| ----------------- | ------------------------------------------------------------------ |
| ✅ **VERIFICADO** | Observado en la respuesta real de la API, con la evidencia anotada |
| 🟡 **REPORTADO**  | Lo dice la comunidad. **No es evidencia**                          |
| ⬜ **SIN MEDIR**  | El experimento no lo cubre. No se rellena a ojo                    |

---

## Resultados

| Pregunta                                      | Resultado                                             | Evidencia                                                                     |
| --------------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------- |
| ¿Aparece la batalla amistosa en el battlelog? | ✅ **SÍ**, y en **los dos** historiales               | `battleTime` idéntico en ambos: `20260910T050249.000Z`                        |
| ¿Qué `type` tiene?                            | ✅ `"friendly"`                                       | `gameMode: { id: 72000007, name: "Friendly" }`                                |
| ¿Cuántas batallas devuelve?                   | ✅ **Al menos 30**                                    | Cuenta B: 30 entradas. Cuenta A: 1 (solo tenía esa)                           |
| ¿Hay `crowns`? ¿Dónde?                        | ✅ **SÍ**, en cada entrada de `team[]` y `opponent[]` | 62 de 62 lados analizados traen `crowns`                                      |
| ¿Hay mazos?                                   | ✅ **SÍ**, 8 cartas por lado, 62 de 62                | Más `supportCards` (tropa de torre)                                           |
| ¿Se identifica al jugador por tag?            | ✅ **SÍ**, 62 de 62 lados traen `tag`                 | `#CCC8UQU8Y` y `#VUJLVYR8R` en ambos historiales                              |
| ¿Cuánto permanece una batalla?                | ✅ **Al menos 41,4 h**                                | Cuenta B cubre de `2026-09-08T11:40:32Z` a `2026-09-10T05:02:49Z`             |
| ¿Qué devuelve `GET /cards`?                   | ✅ 200 · **123 cartas**                               | Claves: `id, name, elixirCost, rarity, maxLevel, maxEvolutionLevel, iconUrls` |
| ¿Existe un identificador único de batalla?    | ✅ **NO EXISTE**                                      | Ninguna clave de la batalla es un id propio                                   |
| ¿`verifytoken` existe y responde?             | ⬜ **sin medir**                                      | No se probó: se decidió no usarlo                                             |

### PASS / PARTIAL / FAIL por objetivo

| Objetivo de la fase                 | Veredicto             | Por qué                                                                                                                                    |
| ----------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 1. Verificar la API real            | **PASS**              | Los diez puntos del guion respondidos con datos observados                                                                                 |
| 2. Identidad de participantes       | **PARTIAL**           | El `tag` es un identificador estable y utilizable. La _verificación de propiedad_ queda fuera: depende de `verifytoken`, que no es oficial |
| 3. Importar datos reales            | **PASS**              | Jugadores, battlelog, coronas, mazos, cartas, timestamps y tipo: todo presente                                                             |
| 4. Preparar propuesta de resultados | **PASS con salvedad** | Hay todo lo necesario para proponer. La salvedad es la deduplicación: no hay id de batalla                                                 |

---

## La batalla observada

Nuestra amistosa, tal y como la devuelve la API (mismo objeto desde los dos
historiales, con `team` y `opponent` intercambiados según de quién sea el log):

```json
{
  "battleTime": "20260910T050249.000Z",
  "type": "friendly",
  "gameMode": { "id": 72000007, "name": "Friendly" },
  "arena": { "id": 54000007, "name": "Hog Mountain", "rawName": "Arena_L" },
  "deckSelection": "collection",
  "isHostedMatch": false,
  "isLadderTournament": false,
  "leagueNumber": 1,
  "team":     [{ "tag": "#CCC8UQU8Y", "crowns": 0, "cards": [8 cartas], "supportCards": [] }],
  "opponent": [{ "tag": "#VUJLVYR8R", "crowns": 1, "cards": [8 cartas], "supportCards": [1] }]
}
```

Resultado real: **`#VUJLVYR8R` ganó 1–0**.

Que el mismo objeto aparezca en los dos historiales, con los lados
intercambiados, es exactamente el caso que ya cubre el test
«acierta el orden aunque el historial sea el del visitante» del `mapper`.

---

## Diferencias entre lo esperado y lo real

Esto es lo más valioso del spike: donde nos equivocábamos.

### 1. ✅ No existe identificador de batalla — **cambia el diseño**

Se buscó cualquier clave que pudiera servir de id propio. **No hay ninguna.**
`gameMode.id` y `arena.id` son ids de catálogo, no de la batalla.

La idempotencia no puede apoyarse en `provider + externalId` como se planteó.
La clave natural que sí existe en los datos es:

```
(battleTime, tags de los dos jugadores ordenados)
```

Es estable —la misma batalla trae el mismo `battleTime` en ambos historiales,
comprobado— y basta para no importar dos veces lo mismo.

### 2. ✅ Al menos 30 entradas, no 25

La comunidad repetía «las 25 últimas». La cuenta B devolvió **30**. No se puede
afirmar que 30 sea el tope: puede ser sencillamente todo lo que esa cuenta tiene
en la ventana de retención. Lo honesto es **«al menos 30»**.

### 3. ✅ `isHostedMatch: false` en una amistosa

Era tentador usar `isHostedMatch` para identificar amistosas. **No sirve**:
nuestra amistosa lo trae en `false`. El discriminador fiable es `type`.

### 4. ✅ `trophyChange` está ausente en las amistosas

| Tipo         | Lados con `trophyChange` | Sin él |
| ------------ | ------------------------ | ------ |
| `friendly`   | 0                        | 4      |
| `PvP`        | 50                       | 2      |
| `tournament` | 3                        | 3      |

Correlaciona, pero `type` sigue siendo el criterio a usar.

### 5. ✅ Campos reales que no modelábamos

Nuestros tipos se quedaron cortos. Presentes de verdad:

**En la batalla**: `isHostedMatch`, `isLadderTournament`, `leagueNumber`,
`tournamentTag` (solo en las de torneo), `arena.rawName`.

**En cada lado**: `elixirLeaked`, `globalRank`, `kingTowerHitPoints`,
`princessTowersHitPoints`, `supportCards`.

**En cada carta**: `id`, `rarity`, `elixirCost`, `evolutionLevel`,
`maxEvolutionLevel`, `starLevel`, y `iconUrls` con tres variantes
(`medium`, `heroMedium`, `evolutionMedium`).

`princessTowersHitPoints` es un array cuya **longitud indica cuántas torres
seguían en pie**: el perdedor traía `[3052]` (una torre caída) y el ganador
`[1542, 1876]` (ninguna). Es información de contexto, no normativa.

### 6. ✅ Coronas de 0 a 3, máximo observado 3

Consistente con lo que asume el torneo. **No cierra P-03**: una muestra de 31
batallas no demuestra que el máximo sea siempre 3, solo que no se observó otra
cosa.

### 7. ✅ `deckSelection: "collection"`

La API dice **cómo se eligió el mazo**. Es un dato que la discusión de P-04 va a
querer, pero no la decide.

---

## Forma real de una carta

```json
{
  "name": "Wizard",
  "id": 26000017,
  "level": 9,
  "evolutionLevel": 1,
  "maxLevel": 14,
  "maxEvolutionLevel": 3,
  "rarity": "rare",
  "elixirCost": 5,
  "iconUrls": {
    "medium": "https://api-assets.clashroyale.com/cards/300/...png",
    "heroMedium": "...",
    "evolutionMedium": "..."
  }
}
```

`supportCards` trae las tropas de torre con la misma forma, sin `elixirCost`:

```json
{
  "name": "Tower Princess",
  "id": 159000000,
  "level": 11,
  "maxLevel": 16,
  "rarity": "common",
  "iconUrls": { "medium": "..." }
}
```

---

## Qué datos tenemos, y cuáles no

### Tenemos (con evidencia)

- Que una amistosa **aparece en los dos historiales**, con el mismo `battleTime`.
- **Coronas de ambos lados**, en el 100 % de los lados observados.
- **Tags de ambos jugadores**, en el 100 % de los lados observados.
- **Mazos completos** de 8 cartas por lado, con nivel, rareza y coste.
- **Catálogo de 123 cartas** con sus iconos.
- **Retención de al menos 41,4 horas**.
- El modelo de error: 403 con `reason`, tanto sin token como con token inválido.

### NO tenemos

- **Un identificador de batalla.** No existe.
- **El tope real de entradas.** Solo sabemos que es ≥ 30.
- **La retención máxima.** Solo la cota inferior. Requiere ejecutar el spike dos
  veces separadas en el tiempo y ver qué desapareció.
- **Los umbrales de `429`.** No se llegó a provocar uno.
- **Confirmación de que el máximo de coronas sea siempre 3.**
- **Nada sobre `verifytoken`.** No se probó, por decisión.
- **Comportamiento con 2v2.** Todas las entradas fueron 1v1 (`team.length === 1`).

---

## Qué se puede implementar, y qué no

### Con evidencia suficiente

| Funcionalidad                         | Por qué es viable                                            |
| ------------------------------------- | ------------------------------------------------------------ |
| **Importar batallas**                 | El battlelog trae todo lo necesario y las amistosas aparecen |
| **Detección de candidatos**           | Hay tags y `battleTime` para cruzar con el calendario        |
| **Propuesta de marcador**             | Las coronas están en el 100 % de los lados                   |
| **Catálogo de cartas**                | `GET /cards` responde 123 cartas con forma estable           |
| **Mostrar el mazo de un partido**     | 8 cartas por lado, con iconos                                |
| **Vincular un tag a un participante** | El `tag` es estable y viene siempre                          |

### Bloqueado, y por qué

| Funcionalidad                            | Bloqueo                                                                                |
| ---------------------------------------- | -------------------------------------------------------------------------------------- |
| **Verificar la propiedad de una cuenta** | Depende de `verifytoken`, no oficial. Decisión de producto pendiente                   |
| **Cerrar P-11**                          | Lo anterior. Vincular ≠ verificar                                                      |
| **Confirmar resultados automáticamente** | No es un bloqueo técnico: es una decisión ya tomada. Siempre confirma un administrador |
| **Sincronización dimensionada**          | Sin conocer los límites de peticiones no se puede fijar una frecuencia                 |

### La restricción que condiciona el calendario de sincronización

La retención medida (**≥ 41,4 h**) es **mayor que el plazo de impugnación de 24 h**
(R-06). Es una buena noticia: da margen para que una reclamación llegue y la
evidencia todavía exista. Pero como solo tenemos la cota inferior, **conviene
sincronizar poco después de cada jornada** en lugar de confiar en que la ventana
sea holgada.

---

## Limitaciones de la API

1. **Sin identificador de batalla.** Obliga a deduplicar por clave compuesta.
2. **Sin paginación ni filtros** en el battlelog. Se recibe lo que hay.
3. **Ventana corta.** Lo que sale de la ventana se pierde para siempre.
4. **Token ligado a IP.** Sigue siendo la restricción operativa más importante.
   Un 403 no distingue token mal escrito de IP no declarada.
5. **Límites de peticiones no publicados.** No se asume ninguno.
6. **Documentación tras login.** Cualquier cambio se detecta al romperse algo.
7. **No es tiempo real.** La batalla aparece cuando ha terminado.

---

## Cómo se ejecutó

```bash
node --env-file=.env apps/api/src/scripts/clash-royale-spike.ts \
  --tag "#CCC8UQU8Y" --tag "#VUJLVYR8R"
```

Token en `.env` (ignorado por git), nunca en la línea de comandos. La IP pública
declarada era `148.227.105.101`. Cinco peticiones en total: `/cards`, y perfil y
battlelog de cada cuenta. Todas 200.

### Qué produjo

| Archivo                                                     | Qué es                        | ¿Se versiona? |
| ----------------------------------------------------------- | ----------------------------- | ------------- |
| `evidence/clash-royale/report.json`                         | Las respuestas mecánicas      | No            |
| `evidence/clash-royale/battlelogs.raw.json`                 | Volcado crudo de 31 batallas  | No            |
| `apps/api/test/fixtures/clash-royale/battlelog.sample.json` | Fixture seudonimizada, 314 KB | Sí            |

Comprobado que la fixture **no contiene ningún tag real**: los 31 tags que
aparecen son seudónimos derivados por hash (`#P590965`…), más el marcador fijo
`#CLAN`, y los 30 nombres de jugador están sustituidos. Los tags reales
`#CCC8UQU8Y` y `#VUJLVYR8R` no aparecen ni una vez.

> La fixture pesa 314 KB porque lleva las 31 batallas con sus mazos completos.
> Cuando se construyan los tests conviene recortarla a los casos que hagan
> falta: una amistosa, una de escalera, una sin coronas y una inválida.

---

## Siguiente paso recomendado

**No implementar todavía.** El orden que queda:

1. **Decidir el alcance** con los datos ya en la mano: ¿se quiere importación de
   batallas y propuesta de candidatos, o solo enriquecimiento —mazo y perfil— y
   los resultados siguen entrando a mano?
2. **Decidir sobre `verifytoken`**, que es lo único que bloquea P-11: asumir una
   capacidad no oficial, o vincular tags sin verificar propiedad y aceptar que un
   participante podría declarar el tag de otro.
3. **Medir la retención máxima**: volver a ejecutar el spike dentro de unos días
   con las mismas cuentas y ver qué batallas desaparecieron. Es la única forma
   de saber cada cuánto hay que sincronizar.
4. Solo entonces, y solo lo que se haya decidido: modelo de datos externo,
   deduplicación por `(battleTime, tags)`, detección de candidatos y revisión
   administrativa.

Ninguna regla P-01…P-11 se cierra con este spike. **P-03** y **P-04** reciben
datos que la discusión va a querer, pero siguen siendo decisiones de reglamento.

---

## Referencias

- [clash-royale-api.md](clash-royale-api.md) — investigación de la Fase 0.
- [apps/api/src/integrations/clash-royale/README.md](../apps/api/src/integrations/clash-royale/README.md) — la arquitectura preparada.
- `apps/api/src/scripts/clash-royale-spike.ts` — el arnés.
