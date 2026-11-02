# Recuperación de la temporada 2026-1

En noviembre de 2026 se perdió la base de datos de la liga (`datos/liga`, que no
se versiona) y con ella el registro partido a partido de las jornadas 1 a 7.
Este documento explica qué se recuperó, qué se sorteó y cómo se vuelve a cargar.

---

## Qué es real y qué es sorteo

| Dato                                                                    | Origen                                   |
| ----------------------------------------------------------------------- | ---------------------------------------- |
| Clasificación tras la J7 (PJ, VG, VP, DC, PTS)                          | **Real**: captura del admin              |
| Nimaben y Eli_as, únicos con victorias a 3 coronas (dos c/u)            | **Real**                                 |
| Renuz pierde por walkover sus pendientes con Eze23ml, Lucía y Herobrain | **Real**                                 |
| 17 resultados de J1-J7 (todos los de Nimaben y Eli_as, algunos más)     | **Real**: recuerdo del admin             |
| LeonSB gana por walkover a Eze23ml                                      | **Real**: recuerdo del admin             |
| LeonSB gana por walkover a Renuz                                        | Recordado y exigido por la tabla         |
| Dullys pierde un partido por incomparecencia                            | **Exigido por la tabla**; rival sorteado |
| Orden del calendario (qué cruce va en qué jornada)                      | **Sorteo**                               |
| Los otros 12 marcadores de J1-J7                                        | **Sorteo**                               |
| Cruces de J8 y J9                                                       | **Deducidos** (ver abajo)                |
| Fechas de J1-J7 (domingos desde el 20-09, 20:00 UTC-03:00)              | **Supuesto**                             |

Lo sorteado está atado a lo real: **la tabla que sale es exactamente la de la
captura**, jugador por jugador, más los tres walkovers de Renuz. Ningún puesto
cambia por el sorteo, y todos los empates a puntos se resuelven por diferencia
de coronas, así que el enfrentamiento directo sorteado no decide nada.

Cada resultado lleva una nota que dice de dónde sale («Resultado reconstruido
por sorteo…» o «Resultado según lo recuerda la administración…»), visible en el
panel, y la auditoría registra la restauración con su fecha real.

---

## Lo que se recuerda

Resultados de J1-J7, ganador primero:

| Quién lo recuerda todo | Partidos                                                                                                                                               |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Nimaben (7)            | Nimaben 1-0 Herobrain (J1) · Lucía 1-0 Nimaben · Nimaben 3-0 Dullys · Esteban 1-0 Nimaben · Lyuk 1-0 Nimaben · LeonSB 1-0 Nimaben · Nimaben 3-0 Eli_as |
| Eli_as (7)             | Eli_as 3-0 Renuz · Eli_as 3-0 Dullys · Eli_as 1-0 Lucía · Esteban 1-0 Eli_as · Eze23ml 1-0 Eli_as · Lyuk 1-0 Eli_as · (Nimaben 3-0 Eli_as)             |
| Sueltos                | Herobrain 1-0 Lyuk · Lucía 1-0 Lyuk · Eze23ml 1-0 Lucía · Lyuk 1-0 LeonSB                                                                              |

Más los walkovers: LeonSB a Eze23ml y a Renuz, y los tres pendientes de Renuz.

Los siete de Nimaben y los siete de Eli_as **cuadran exactos con la tabla**
(victorias, derrotas, diferencia de coronas y victorias a tres coronas).

### Lo que la tabla obliga

- **LeonSB gana a Renuz por walkover.** Con lo recordado, a LeonSB le quedan
  cuatro victorias que deben sumar +3 de diferencia de coronas: una tuvo que
  ser sin jugar.
- **Dullys pierde un partido por incomparecencia.** Perdió 0-3 con Nimaben y
  con Eli_as (−6). Para acabar en −7 con una victoria y cuatro derrotas más,
  esas derrotas no pueden ser todas jugadas: sumarían al menos −4 y su
  victoria, como mucho, +2. Con una sola incomparecencia sale: gana 2-0 y
  pierde las otras tres por una corona. **Contra quién faltó no se sabe: se
  sorteó** (salió Esteban, en la J4).

### Lo que ya no se puede mantener

- **La propuesta de J8 y J9**: 4 de sus 10 cruces ya se habían jugado
  (Nimaben-Esteban, Eli_as-Esteban, LeonSB-Lyuk y Eze23ml-Lucía).
- **«J2 Lucía, J3 Dullys» de Nimaben**: con todo lo demás, ningún calendario
  del sorteo de la web lo permite. Se respeta «primera fecha, Herobrain» y el
  resto se acerca todo lo posible; ese orden debe de ser el de los partidos
  jugados (con aplazamientos), no el de las jornadas.

---

## El sorteo

Todo sale de una semilla y es reproducible:

```bash
npm run reconstruccion:sortear
```

### El calendario

Lo genera el sorteo oficial de la liga (`generateFixture`, método del círculo).
Se prueban las semillas `liga-estabanquitos-2026-1/reconstruccion/1`, `/2`… y
se usa la primera cuyo calendario cumple estos criterios, en orden:

1. **Todos los partidos recordados caen entre la J1 y la J7.** Hay 440
   calendarios así.
2. **Nimaben juega la primera fecha contra Herobrain.** Quedan 48.
3. **Los resultados admiten la tabla con una sola incomparecencia de Dullys**,
   el mínimo. Quedan 10.
4. **Los rivales de Nimaben se parecen lo más posible al orden en que los
   contó**: 3 inversiones respecto de «Herobrain, Lucía, Dullys y después el
   resto», y 7 respecto del orden completo. Queda 1.

La semilla que lo produce es la **720332**. Nimaben queda: J1 Herobrain, J2
LeonSB, J3 Lucía, J4 Eli_as, J5 Dullys, J6 Esteban, J7 Lyuk.

### Los resultados

Los recordados y los walkovers se ponen como se recuerdan. El resto de J1-J7 se
sortea (con la misma semilla) hasta que cada jugador queda con sus victorias,
derrotas, diferencia de coronas y victorias a tres coronas exactas. Los
marcadores frecuentes (1-0, 2-1) salen más que los raros.

Los pendientes de Renuz constan como **aplazados en su fecha, reprogramados
para el 1 de noviembre a partir de las 21:15 y perdidos por incomparecencia**.

### Resultado

En negrita, los recordados.

| J   | Fecha      | Partidos                                                                                                                                                       |
| --- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 2026-09-20 | Esteban 1-0 Eze23ml · **Lucía 0-1 Eli_as** · Lyuk 2-1 Renuz · LeonSB 1-0 Dullys · **Nimaben 1-0 Herobrain**                                                    |
| 2   | 2026-09-27 | **Eli_as 0-1 Esteban** · Eze23ml – Renuz (WO, falta Renuz) · Lucía 0-2 Dullys · **Lyuk 0-1 Herobrain** · **LeonSB 1-0 Nimaben**                                |
| 3   | 2026-10-04 | Esteban 2-1 Renuz · **Eli_as 3-0 Dullys** · Eze23ml 0-1 Herobrain · **Lucía 1-0 Nimaben** · **Lyuk 1-0 LeonSB**                                                |
| 4   | 2026-10-11 | Dullys – Esteban (WO, falta Dullys) · Renuz – Herobrain (WO, falta Renuz) · **Eli_as 0-3 Nimaben** · Eze23ml – LeonSB (WO, falta Eze23ml) · **Lucía 1-0 Lyuk** |
| 5   | 2026-10-18 | Esteban 2-0 Herobrain · **Dullys 0-3 Nimaben** · Renuz – LeonSB (WO, falta Renuz) · **Eli_as 0-1 Lyuk** · **Eze23ml 1-0 Lucía**                                |
| 6   | 2026-10-25 | **Nimaben 0-1 Esteban** · Herobrain 0-1 LeonSB · Dullys 1-2 Lyuk · Renuz – Lucía (WO, falta Renuz) · **Eli_as 0-1 Eze23ml**                                    |
| 7   | 2026-11-01 | Esteban 0-1 LeonSB · **Nimaben 0-1 Lyuk** · Herobrain 0-2 Lucía · Dullys 0-1 Eze23ml · **Renuz 0-3 Eli_as**                                                    |
| 8   | 2026-11-08 | Lyuk – Esteban · LeonSB – Lucía · Nimaben – Eze23ml · Herobrain – Eli_as · Dullys – Renuz                                                                      |
| 9   | 2026-11-15 | Esteban – Lucía · Lyuk – Eze23ml · LeonSB – Eli_as · Nimaben – Renuz · Herobrain – Dullys                                                                      |

J8 y J9 quedan **programadas** (20:00, un partido cada 15 minutos). La vuelta
(J10-J18) repite la ida con local y visitante invertidos y queda sin fecha.

### Qué tan seguros son los cruces de J8 y J9

Cuatro son seguros, porque Nimaben y Eli_as recuerdan todos sus partidos:
**Nimaben-Eze23ml, Nimaben-Renuz, Eli_as-LeonSB y Eli_as-Herobrain**. Los otros
seis (Lyuk-Esteban, LeonSB-Lucía, Dullys-Renuz, Esteban-Lucía, Lyuk-Eze23ml y
Herobrain-Dullys) salen del sorteo: con lo recordado y la tabla hay 13
combinaciones de pendientes posibles (5 si Dullys faltó una sola vez).
**Conviene confirmar con cada jugador contra
quién le falta jugar antes de la J8**; si alguien dice otra cosa, se agrega
como recuerdo y se vuelve a sortear.

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
- **Recuerdos nuevos**: se agregan a `RESULTADOS_RECORDADOS` o
  `WALKOVERS_RECORDADOS` en `apps/api/src/scripts/reconstruccion.ts` y se
  vuelve a sortear con `npm run reconstruccion:sortear`. Si la base ya está
  cargada, hay que restaurar de nuevo sobre una carpeta de datos vacía.
