# Incomparecencia (walkover)

Regla **P-01**, decidida el **10 de septiembre de 2026** y recogida como **R-09**
en el reglamento. Versión `2026-1.2`.

---

## La regla

La tolerancia es de **15 minutos** desde la hora prevista del partido. Pasada la
tolerancia, un administrador **puede** declarar la incomparecencia.

|                            | Presente       | Ausente    |
| -------------------------- | -------------- | ---------- |
| Partidos jugados (PJ)      | +1             | +1         |
| Victorias (VG)             | +1             | —          |
| Derrotas (VP)              | —              | +1         |
| Puntos                     | **+3**         | 0          |
| Coronas a favor            | 0              | 0          |
| Coronas en contra          | 0              | 0          |
| Diferencia de coronas (DC) | sin cambio     | sin cambio |
| Victorias por 3 coronas    | **sin cambio** | —          |

---

## Las tres cosas que no hace, y por qué

### No fabrica un 3–0

Un marcador inventado contamina la **diferencia de coronas**, que es el primer
criterio de desempate después de los puntos. Dos incomparecencias a lo largo de
la temporada decidirían la liga con coronas que nadie consiguió.

El resultado se guarda con `homeCrowns = 0` y `awayCrowns = 0`, y la interfaz no
los enseña: enseña la palabra `WALKOVER` y quién ganó.

### No son 4 puntos

Cuatro puntos es lo que vale una **victoria por tres coronas**, y esa hay que
conseguirla jugando. Una incomparecencia vale lo mismo que una victoria normal.

El `victoryType` es `WALKOVER`, no `MAX_CROWNS`, así que tampoco sube el
contador de victorias máximas de nadie.

### No es automática

`noShow.automatic` es `false` y va a seguir siéndolo. Pasados los quince minutos
el administrador **puede** declararla; no se declara sola.

Un temporizador no distingue «no se presentó» de «la plataforma tenía mal la
hora», y esa diferencia decide una jornada.

---

## Cómo se declara

**Panel → Partidos → (el partido) → Incomparecencia**, o por API:

```
POST /api/v1/admin/matches/:id/walkover
{ "absentPlayerId": "...", "reason": "..." }
```

Cuatro condiciones, y las cuatro devuelven un error explicando cuál falló:

| Condición                                | Si no se cumple                                         |
| ---------------------------------------- | ------------------------------------------------------- |
| El partido tiene hora prevista           | `MATCH_NOT_SCHEDULED`                                   |
| Han pasado los 15 minutos                | `TOLERANCE_NOT_ELAPSED` (dice desde cuándo se puede)    |
| Se dice quién faltó, y juega ese partido | `ABSENT_PLAYER_REQUIRED` / `ABSENT_PLAYER_NOT_IN_MATCH` |
| El partido no tiene ya resultado         | `RESULT_ALREADY_RECORDED`                               |

**Hace falta decir quién faltó** porque con 0–0 el marcador no dice quién gana.
Es la única forma de saberlo sin inventar un resultado.

---

## Qué queda registrado

El partido conserva para siempre:

- el ganador y el ausente;
- su jornada y su fecha originales;
- el instante de la declaración;
- qué administrador la declaró;
- el motivo escrito;
- la petición HTTP (`requestId`), para cruzarla con los registros del servidor.

En la auditoría es la acción `WALKOVER_DECLARED`, con la hora prevista y la
tolerancia aplicada dentro de la carga. Eso es lo que hace la decisión revisable
seis meses después.

En la base de datos, la columna `match_results.absent_player_id` guarda quién
faltó. Sin ella el resultado no se podría reconstruir al leerlo.

---

## Cómo se ve

| Superficie         | Qué enseña                                                                                                 |
| ------------------ | ---------------------------------------------------------------------------------------------------------- |
| Tarjeta de partido | «Walkover: gana X por incomparecencia. Sin coronas ni marcador.» Los dos lados con guion.                  |
| Match Center       | `WALKOVER` en el marcador, y un aviso que dice que no hubo batalla pero que sí cuenta en la clasificación. |
| Overlay de OBS     | `W. O.` en color de aviso, y el estado dice «Walkover», no «Final».                                        |
| Clasificación      | Como cualquier otra victoria: +1 PJ, +1 VG, +3 PTS, DC sin tocar.                                          |

En ninguna aparece un `0–0`. Un cero a cero en pantalla se lee como un empate
que se jugó, que es exactamente lo contrario de lo que pasó.

---

## Si otra temporada la deja sin decidir

La regla vive en la configuración del torneo, no en el código:

```ts
scoring: {
  walkoverWin: 3,        // null = sin decidir
  walkoverCrowns: [0, 0] // null = sin decidir
}
```

Con `walkoverWin: null`, declarar una incomparecencia vuelve a fallar con
`PENDING_RULE`, igual que antes del 10 de septiembre de 2026. Hay un test que lo
comprueba: la decisión es de esta temporada, no está grabada en el motor.
