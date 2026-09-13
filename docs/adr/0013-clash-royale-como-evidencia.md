# ADR 0013 — Clash Royale es evidencia externa, no la fuente de verdad

**Estado:** aceptada · 2026-09-10

## Contexto

El spike del 10 de septiembre confirmó que la API oficial devuelve todo lo que
haría falta para automatizar la carga de resultados: las batallas amistosas
aparecen en el historial de los dos jugadores, con las coronas de cada lado, las
etiquetas de ambos y los mazos completos.

Es decir: **técnicamente se podría** cerrar el circuito y dejar que una batalla
importada se convierta sola en resultado oficial. Nadie lo notaría hasta el día
en que fuese mal.

Y va a ir mal alguna vez. Del propio spike salen tres motivos:

1. **Una amistosa no es necesariamente el partido.** Dos participantes pueden
   picarse fuera de la liga; el juego no distingue.
2. **La misma pareja se enfrenta dos veces por temporada**, ida y vuelta. Una
   batalla encaja en los dos partidos, y si ninguno tiene fecha no hay forma
   honesta de elegir.
3. **No existe identificador de batalla.** La identidad se deriva de los datos,
   con las limitaciones que eso trae ([ADR 0014](0014-huella-de-batalla.md)).

A eso se suma lo que ya sabíamos: la liga tiene reglamento propio, aplazamientos,
sanciones, correcciones y once reglas sin decidir. El juego no conoce nada de
eso.

## Decisión

**Los datos de Clash Royale son evidencia. La fuente de verdad del torneo sigue
siendo el dominio de la liga.**

En la práctica, cuatro consecuencias que se pueden comprobar en el código:

1. **Los datos externos viven en sus propias tablas** (`external_battles`,
   `external_battle_sides`, `external_battle_cards`, `battle_candidates`). Nada
   de la integración escribe en `matches`, `match_results`, `standings` ni
   `sanctions`.
2. **Una batalla nunca se convierte en resultado sola.** Produce un _candidato_,
   que es una propuesta con sus motivos y sus ambigüedades.
3. **Confirmar es un acto humano**, y confirmar llama a `recordResult`, el mismo
   servicio que atiende un resultado escrito a mano. La puntuación, el tipo de
   victoria y la clasificación los sigue calculando el motor de siempre.
4. **`confidence` no autoriza nada.** Ordena la cola de revisión. Un 100 y un 40
   exigen la misma decisión, y el botón es el mismo.

Se guarda lo normalizado y **no el payload crudo**: una batalla completa ronda
los 10 KB y lleva etiquetas y nombres de terceros que no han dado permiso. Es la
misma línea que trazó la [ADR 0012](0012-ficha-publica-de-partido.md).

## Alternativas descartadas

- **Confirmar solo por encima de cierta confianza.** Convierte un número
  heurístico en autoridad. El día que se equivoque, la tabla mentirá y nadie
  sabrá por qué; y elegir el umbral sería inventarse una probabilidad que nadie
  ha medido.
- **Importar únicamente las amistosas.** Ocultaría información útil: una batalla
  de escalera entre dos participantes es evidencia legítima de que jugaron. Que
  **no** sea amistosa es una ambigüedad que el administrador debe ver, no algo
  que esconderle.
- **Escribir los resultados desde la integración.** Habría dos caminos hacia
  `match_results` con dos formas de validar. Tarde o temprano dirían cosas
  distintas.
- **Guardar el payload crudo por si acaso.** Peso y datos de terceros a cambio de
  nada que el sistema use.

## Consecuencias

- La liga puede explicar cualquier punto de su tabla sin apelar a un tercero.
- Un cambio en la API de Supercell degrada la evidencia, no corrompe la
  competición.
- **Coste asumido:** hay trabajo administrativo que no se elimina. La
  integración lo reduce —el marcador viene propuesto, con los mazos y la hora—
  pero alguien sigue teniendo que decir que sí.
- La evidencia pública de un partido solo aparece cuando hay un candidato
  **confirmado**. Una sospecha sin resolver no sale al público: se leería como
  resultado.
