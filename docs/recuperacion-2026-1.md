# Recuperación de la temporada 2026-1

En noviembre de 2026 se perdió la base de datos de la liga (`datos/liga`, que no
se versiona) y con ella el registro partido a partido de las jornadas 1 a 7.
Este documento explica qué se recuperó, qué se sorteó y cómo se vuelve a cargar.

---

## Qué es real y qué es sorteo

| Dato                                                                    | Origen                        |
| ----------------------------------------------------------------------- | ----------------------------- |
| Clasificación tras la J7 (PJ, VG, VP, DC, PTS)                          | **Real**: captura del admin   |
| Nimaben y Eli_as, únicos con victorias a 3 coronas (dos c/u)            | **Real**                      |
| Renuz pierde por walkover sus pendientes con Eze23ml, Lucía y Herobrain | **Real**                      |
| Cruces de las jornadas 8 y 9                                            | **Real**: propuesta del admin |
| Walkovers de LeonSB contra Renuz y Eze23ml                              | Recordado, sin confirmar      |
| Orden del calendario (qué cruce va en qué jornada)                      | **Sorteo**                    |
| Marcadores de J1-J7                                                     | **Sorteo**                    |
| Fechas de J1-J7 (domingos desde el 20-09, 20:00 UTC-03:00)              | **Supuesto**                  |

Lo sorteado está atado a lo real: **la tabla que sale es exactamente la de la
captura**, jugador por jugador, más los tres walkovers de Renuz. Ningún puesto
cambia por el sorteo, y todos los empates a puntos se resuelven por diferencia
de coronas, así que el enfrentamiento directo sorteado no decide nada.

Cada resultado reconstruido lleva una nota que lo dice («Resultado reconstruido
por sorteo…»), visible en el panel, y la auditoría registra la restauración con
su fecha real.

---

## El sorteo

Todo sale de una semilla y es reproducible:

```bash
npm run reconstruccion:sortear
```

### El calendario

Lo genera el sorteo oficial de la liga (`generateFixture`, método del círculo).
Se prueban las semillas `liga-estabanquitos-2026-1/reconstruccion/1`, `/2`… y
se usa la primera cuyo calendario cumple tres criterios de coherencia:

1. **J8 y J9 son exactamente los cruces propuestos**, en ese orden. Eso obliga
   a que J1-J7 tengan los otros 35, y es lo que dice la tabla: cada jugador ya
   enfrentó a 7 rivales.
2. **Local y visitante coinciden con la propuesta en 9 de 10 partidos**, el
   máximo posible (ningún calendario del método del círculo coincide en los 10).
   La diferencia: en la J9 juega **Renuz-Lyuk**, no Lyuk-Renuz.
3. **Los tres pendientes de Renuz caen en jornadas seguidas** (J3, J4 y J5):
   una ausencia de tres semanas es más creíble que tres sueltas.

De los 20 calendarios que terminan con esos cruces, 10 los tienen en ese orden,
2 de ellos coinciden en 9 de 10 en local y visitante, y solo uno cumple además
el tercer criterio. La semilla que lo produce es la **227373**.

### Los resultados

Se sortean ganador y marcador de cada partido jugado de J1-J7 (con la misma
semilla) hasta que cada jugador queda con sus victorias, derrotas, diferencia de
coronas y victorias a tres coronas exactas. Los marcadores frecuentes (1-0, 2-1)
salen más que los raros.

Los pendientes de Renuz constan como **aplazados en su fecha, reprogramados
para el 1 de noviembre a partir de las 21:15 y perdidos por incomparecencia**.

### Resultado

| J   | Fecha      | Partidos                                                                                                              |
| --- | ---------- | --------------------------------------------------------------------------------------------------------------------- |
| 1   | 2026-09-20 | Renuz 1-2 Esteban · Lyuk 2-1 Dullys · Nimaben 1-0 Herobrain · LeonSB 1-0 Lucía · Eli_as 1-2 Eze23ml                   |
| 2   | 2026-09-27 | Dullys 2-0 Renuz · Esteban 2-0 Herobrain · Lyuk 2-1 Lucía · Nimaben 1-2 Eze23ml · LeonSB 1-0 Eli_as                   |
| 3   | 2026-10-04 | Renuz – Herobrain (WO, falta Renuz) · Dullys 0-1 Lucía · Esteban 0-2 Eze23ml · Lyuk 1-0 Eli_as · Nimaben 0-1 LeonSB   |
| 4   | 2026-10-11 | Lucía – Renuz (WO, falta Renuz) · Herobrain 1-0 Eze23ml · Dullys 0-2 Eli_as · Esteban 2-1 LeonSB · Lyuk 0-3 Nimaben   |
| 5   | 2026-10-18 | Renuz – Eze23ml (WO, falta Renuz) · Lucía 2-1 Eli_as · Herobrain 0-1 LeonSB · Dullys 0-3 Nimaben · Esteban 1-0 Lyuk   |
| 6   | 2026-10-25 | Eli_as 3-1 Renuz · Eze23ml – LeonSB (WO, falta Eze23ml) · Lucía 1-0 Nimaben · Herobrain 0-2 Lyuk · Dullys 1-2 Esteban |
| 7   | 2026-11-01 | Renuz – LeonSB (WO, falta Renuz) · Eli_as 3-2 Nimaben · Eze23ml 0-2 Lyuk · Lucía 0-1 Esteban · Herobrain 2-1 Dullys   |
| 8   | 2026-11-08 | Nimaben – Renuz · LeonSB – Lyuk · Eli_as – Esteban · Eze23ml – Dullys · Lucía – Herobrain                             |
| 9   | 2026-11-15 | Renuz – Lyuk · Nimaben – Esteban · LeonSB – Dullys · Eli_as – Herobrain · Eze23ml – Lucía                             |

J8 y J9 quedan **programadas** (20:00, un partido cada 15 minutos). La vuelta
(J10-J18) repite la ida con local y visitante invertidos y queda sin fecha.

Clasificación tras la restauración:

| Pos | Jugador   | PJ  | VG  | VP  | DC  | PTS |
| --- | --------- | --- | --- | --- | --- | --- |
| 1   | Esteban   | 7   | 6   | 1   | +5  | 18  |
| 2   | LeonSB    | 7   | 6   | 1   | +3  | 18  |
| 3   | Lyuk      | 7   | 5   | 2   | +3  | 15  |
| 4   | Eze23ml   | 7   | 4   | 3   | +1  | 12  |
| 5   | Lucía     | 7   | 4   | 3   | 0   | 12  |
| 6   | Nimaben   | 7   | 3   | 4   | +3  | 11  |
| 7   | Eli_as    | 7   | 3   | 4   | +1  | 11  |
| 8   | Herobrain | 7   | 3   | 4   | −4  | 9   |
| 9   | Dullys    | 7   | 1   | 6   | −7  | 3   |
| 10  | Renuz     | 7   | 0   | 7   | −5  | 0   |

---

## Cargarla

El sorteo queda escrito en [`temporada/2026-1.json`](../temporada/2026-1.json),
que **sí se versiona**: es la copia de la temporada que no se puede volver a
perder. Para cargarla en una base vacía:

```bash
npm run restaurar
```

Usa `DATABASE_URL`, `ADMIN_EMAIL` y `ADMIN_PASSWORD` de `.env`. Crea el torneo y
el administrador, suma a Eli_as, Lucía, Herobrain y Renuz, genera el calendario
con la semilla, pone las fechas, registra los resultados y walkovers y, al
final, **comprueba que la clasificación es la de la tabla de arriba**. Si no lo
es, lo dice y sale con error.

Todo pasa por la API con sesión de administrador, como en el panel: las mismas
validaciones y la misma auditoría.

Se niega a trabajar sobre una base que ya tiene calendario. Para empezar de
cero: parar el servidor, copiar y borrar `datos/liga`, y volver a ejecutarlo.

---

## Si aparece un dato real

Si alguien recuerda o encuentra el resultado real de un partido de J1-J7, se
corrige **en el panel** (ficha del partido → Corregir), que deja revisión y
auditoría. Ojo: un marcador distinto puede cambiar la diferencia de coronas y
alejar la tabla de la captura.

## Lo que no se registró

- **Misael y Joel** figuraban en una lista vieja; hoy están Herobrain y Renuz.
  No hay registro de cuándo ni cómo se los sustituyó, así que no se inventa una
  sustitución: la plantilla se carga con los diez actuales.
- **Los walkovers de LeonSB** se cargan porque es lo que recuerda el
  administrador y la tabla lo admite. Si no fueron así, se quitan de
  `WALKOVERS_RECORDADOS` en `apps/api/src/scripts/reconstruccion.ts` y se
  vuelve a sortear.
