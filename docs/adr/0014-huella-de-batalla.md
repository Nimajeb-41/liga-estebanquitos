# ADR 0014 — La identidad de una batalla es una huella derivada

**Estado:** aceptada · 2026-09-10

## Contexto

El plan de la Fase 3 daba por hecho que la deduplicación sería
`provider + externalId`, que es lo habitual al importar de un tercero.

El spike buscó ese identificador en la respuesta real y **no existe**. Ninguna
clave de la batalla sirve: `gameMode.id` y `arena.id` son ids de catálogo, no de
la batalla concreta.

Y hace falta alguna forma de identidad, porque **la misma batalla llega dos
veces**: una desde el historial de cada jugador. Sin deduplicar, cada
sincronización crearía registros repetidos y candidatos duplicados.

## Decisión

La identidad se deriva de los datos:

```
fingerprint = SHA-256( battleTime en ISO | etiquetas de los dos, ordenadas )
```

Verificado en el spike: la misma batalla trae **el mismo `battleTime`** en los
dos historiales, y las mismas dos etiquetas. Ordenarlas hace la huella
independiente de qué historial se consultó.

Tres decisiones dentro de la decisión:

1. **Las coronas quedan fuera de la huella.** Si formaran parte, el mismo
   enfrentamiento reimportado con un marcador distinto se guardaría como dos
   batallas en vez de delatar la incoherencia.
2. **Una huella repetida con datos distintos no sobrescribe.** Se conserva la
   primera versión y se enciende `needs_review`. El panel lo avisa antes de
   dejar confirmar.
3. **Un candidato confirmado aparta a sus hermanos.** Una batalla no puede ser
   dos partidos: al confirmarla para uno, las demás propuestas de esa misma
   batalla pasan a `NEEDS_REVIEW`. No se rechazan —eso sería decidir por el
   administrador—, solo dejan de hacer cola.

## Limitación, dicha sin adornos

**Dos batallas distintas entre las mismas dos personas registradas en el mismo
segundo producirían la misma huella.** No es imposible: es improbable.

No se afirma que las colisiones sean imposibles porque no lo son. Lo que sí se
garantiza es que una colisión **no corrompe nada en silencio**: la segunda
llegada no cuadraría con la guardada, y el sistema la marcaría para revisión en
lugar de pisarla.

## Alternativas descartadas

- **`provider + externalId`.** No hay `externalId`. Ese era el plan y la realidad
  lo descartó.
- **Incluir las coronas en la huella.** Convierte una incoherencia en un
  duplicado silencioso, que es peor.
- **Deduplicar solo por hora.** Dos partidos distintos de la misma jornada
  pueden empezar a la vez.
- **Deduplicar solo por pareja.** Colisionaría con la ida y la vuelta, y con
  cualquier revancha amistosa.
- **Importar de un solo historial por partido.** Evitaría el duplicado, pero
  perdería la batalla cuando ese jugador la tenga fuera de su ventana de
  retención y el otro no.

## Consecuencias

- Importar dos veces el mismo historial no crea nada nuevo. Hay test.
- La misma batalla desde los dos historiales se guarda una sola vez. Hay test.
- La huella es reproducible: se puede recalcular a mano desde el dato original.
- **Coste asumido:** la deduplicación depende de que Supercell no cambie la
  precisión de `battleTime`. Si algún día llegara con menos resolución, la
  probabilidad de colisión subiría, y habría que revisar esta decisión.
