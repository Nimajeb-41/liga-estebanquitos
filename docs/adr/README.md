# Decisiones de arquitectura (ADR)

Cada archivo registra una decisión con alternativas reales: qué se decidió, qué
se descartó y qué cuesta.

| #                                            | Decisión                                                  |
| -------------------------------------------- | --------------------------------------------------------- |
| [0001](0001-monorepo-npm-workspaces.md)      | Monorepo con npm workspaces                               |
| [0002](0002-dominio-puro.md)                 | Dominio puro, separado de la persistencia                 |
| [0003](0003-fixture-metodo-circulo.md)       | Fixture por método del círculo con semilla guardada       |
| [0004](0004-match-sin-matchplayer.md)        | Local y visitante en la fila del partido                  |
| [0005](0005-reglas-pendientes-explicitas.md) | Las reglas sin definir fallan de forma explícita          |
| [0006](0006-desempates-configurables.md)     | Desempates configurables con mini-liga                    |
| [0007](0007-sustitucion-participantes.md)    | Sustitución de participantes con trazabilidad             |
| [0008](0008-panel-servido-por-la-api.md)     | El panel de administración lo sirve la API _(sustituida)_ |
| [0009](0009-pglite-en-tests.md)              | Los tests de integración corren contra PGlite             |
| [0010](0010-reportes-autenticados.md)        | El reporte de resultados exige sesión en la Fase 1        |
| [0011](0011-panel-en-astro-con-bff.md)       | El panel pasa a Astro, con la sesión reenviada            |
| [0012](0012-ficha-publica-de-partido.md)     | La ficha pública de un partido va recortada               |
| [0013](0013-clash-royale-como-evidencia.md)  | Clash Royale es evidencia, no la fuente de verdad         |
| [0014](0014-huella-de-batalla.md)            | La identidad de una batalla es una huella derivada        |
| [0015](0015-vincular-no-es-verificar.md)     | Vincular una cuenta no es verificar su propiedad          |

## Formato

Estado · Contexto · Decisión · Alternativas descartadas · Consecuencias.

Una ADR no se edita cuando se cambia de opinión: se escribe una nueva que la
sustituya y se marca la anterior como _sustituida_.
