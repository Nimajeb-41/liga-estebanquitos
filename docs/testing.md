# Estrategia de testing

Herramienta: **Vitest**. Ejecución: `npm test` en la raíz.

```
packages/domain     203 tests   10 archivos   reglas puras, sin base de datos
packages/database    12 tests    1 archivo    restricciones del esquema
apps/api            265 tests    8 archivos   integración HTTP -> servicio -> base
apps/web            129 tests   10 archivos   componentes, con jsdom
                    ---------
                    609 tests
```

Los de Clash Royale **no tocan internet**: el `fetch` se sustituye y las batallas
salen de fixtures obtenidas en el spike real, seudonimizadas. `npm test` nunca
depende de que Supercell esté disponible.

Más `npm run e2e`: **108 comprobaciones** que levantan la pila entera —API sobre
PostgreSQL efímero y el frontend ya construido— y recorren los dos caminos que
tienen que funcionar siempre. Es HTTP de verdad contra el servidor de verdad; no
abre un navegador, así que la hidratación la cubren los tests de componente.

Desde la Fase 4, el recorrido de extremo a extremo incluye además dos barridos
que no son de funcionalidad:

- **Accesibilidad** (`scripts/a11y-checks.mjs`) sobre siete pantallas: idioma,
  encabezados, nombres accesibles de botones y enlaces, etiquetas de formulario,
  encabezados de tabla y viewport ampliable. No sustituye a probar con un lector
  de pantalla; atrapa lo que se cuela de verdad. Encontró que el Match Center no
  tenía `<h1>`.
- **Fuga de secretos en el paquete de cliente**: revisa los `.js` que se descarga
  el navegador buscando la variable del token, cabeceras `Authorization` y
  cualquier cadena con forma de JWT. Es la superficie que los tests de la API no
  ven, porque un `import.meta.env` se resuelve al compilar.

Y dos auditorías fuera de Vitest, dentro de `npm run verify`:

- `npm run audit:secrets` — formas de secreto en lo versionado. **Nunca imprime
  el valor** que encuentra.
- `npm run audit:indexes` — claves ajenas sin un índice que las cubra, con lista
  de excepciones justificadas.

Los tests de integración corren contra **PostgreSQL de verdad**: PGlite
(PostgreSQL compilado a WebAssembly, en memoria) con las **mismas migraciones**
que producción. Sin Docker, sin estado compartido entre suites y con los CHECK,
los índices únicos parciales y las claves foráneas reales en juego. Ver
[ADR 0009](adr/0009-pglite-en-tests.md).

## Qué se prueba y por qué

El criterio no es "cubrir líneas", es **cubrir lo que duele si se rompe en
mitad de una jornada retransmitida**.

| Archivo                                           | Cubre                                                                                            |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `fixture.test.ts`                                 | Generación y validación del calendario (32 casos)                                                |
| `results-scoring.test.ts`                         | Validación de marcadores y puntuación                                                            |
| `standings.test.ts`                               | Estadísticas, sanciones, orden y desempates                                                      |
| `roster.test.ts`                                  | Altas, confirmaciones, plazas y sustituciones                                                    |
| `tournament-status.test.ts`                       | Máquina de estados y configuración                                                               |
| `temporada-completa.test.ts`                      | Recorrido completo de 6 confirmados a campeón                                                    |
| `packages/database/test/schema.test.ts`           | Restricciones que hace cumplir PostgreSQL                                                        |
| `apps/api/test/api-players.test.ts`               | Seguridad, sesión y gestión de participantes                                                     |
| `apps/api/test/api-fixture-results.test.ts`       | Fixture oficial, resultados, puntuación, sanciones                                               |
| `apps/api/test/api-postponement-disputes.test.ts` | Aplazamientos, reprogramaciones, disputas y auditoría                                            |
| `apps/api/test/api-contracts.test.ts`             | Que cada respuesta encaje en el contrato, y que la ficha pública no filtre datos administrativos |
| `apps/api/test/clash-royale.test.ts`              | Cliente y traductor de batallas, sin llamadas reales                                             |
| `apps/web/test/match-card.test.tsx`               | Que un aplazado no parezca derrota ni partido jugado                                             |
| `apps/web/test/standings-table.test.tsx`          | Que la tabla respete el orden del backend y sea accesible                                        |
| `apps/web/test/match-center.test.tsx`             | Historial, directo sin datos inventados, enlaces externos                                        |
| `apps/web/test/rules-catalog.test.ts`             | Que ninguna regla pendiente se presente como decidida                                            |
| `apps/web/test/admin-actions.test.tsx`            | Que el rechazo del motor llegue al administrador                                                 |
| `apps/web/test/errors.test.ts`                    | Traducción de los códigos de error a español                                                     |
| `apps/web/test/presentation.test.ts`              | Formatos, etiquetas y signos                                                                     |
| `apps/api/test/api-clash-royale.test.ts`          | El flujo entero: vincular, sincronizar, revisar, confirmar y que la tabla se mueva               |
| `apps/web/test/clash-royale.test.tsx`             | Que un dato externo nunca se presente como resultado oficial                                     |

## Qué se prueba de la integración externa

La pregunta no es si el código corre: es si la evidencia externa **puede** colarse
como resultado oficial. Los tests que lo impiden:

- una batalla sin coronas no propone marcador, y una sin etiqueta se descarta;
- la misma batalla vista desde los dos historiales es **una**, con la misma huella;
- si la misma huella vuelve con datos distintos, **no se sobrescribe**: se marca;
- el marcador se escribe en el orden del partido aunque el historial sea el del
  visitante;
- la ida y la vuelta se proponen **las dos**, marcadas como ambiguas;
- un candidato sin confirmar no produce resultado ni evidencia pública;
- confirmar pasa por `recordResult` y la clasificación se mueve;
- un empate de coronas lo rechaza el dominio (R-01), no la integración;
- el botón de confirmar está igual de disponible con confianza 100 que con 40;
- el token no aparece ni en la URL ni en los mensajes de error;
- una vinculación **nunca** se marca como verificada.

## Qué se prueba en el frontend

La interfaz no calcula nada, así que no hay lógica de negocio que probar. Lo que
sí puede fallar es la **representación**, y ahí es donde están los tests:

- un partido aplazado no se muestra como derrota, no cuenta como jugado y no
  enseña marcador aunque hubiera un resultado guardado;
- un resultado en disputa no se presenta como definitivo;
- cuando el backend no define los puntos, se dice; no se inventa un número;
- la clasificación respeta el orden del backend, y si el usuario lo cambia, se
  le avisa de que ya no es la oficial;
- un código de error llega al administrador como una frase que se entiende;
- una URL de transmisión con esquema no admitido no se convierte en enlace.

## Fixture

Las propiedades exigidas se comprueban una a una para 10 participantes:

- 18 jornadas · 5 partidos por jornada · 90 partidos · 18 por jugador
- Cada pareja se enfrenta exactamente 2 veces
- Cada jugador aparece exactamente una vez por jornada
- Ida (1–9) y vuelta (10–18) diferenciadas, con local y visitante invertidos
- Ningún enfrentamiento repetido con la misma condición de local
- 9 partidos como local y 9 como visitante por jugador; dentro de cada vuelta,
  entre 4 y 5

Además:

- **Propiedades genéricas** para 4, 6, 8, 12 y 16 participantes: el motor no
  está atado al número 10.
- **Reproducibilidad**: la misma semilla produce el mismo calendario; semillas
  distintas producen sorteos distintos.
- **Casos de error**: número impar, menos de dos, identificadores repetidos,
  vueltas no soportadas.
- **El validador se prueba con fixtures corrompidos a propósito**: se le quita
  una jornada, se duplica un jugador dentro de una jornada y se crea un
  auto-enfrentamiento, comprobando que los detecta. Un validador probado solo
  con datos correctos no demuestra nada.

## Puntuación

Los cuatro casos del reglamento, explícitos:

| Caso                              | Esperado  |
| --------------------------------- | --------- |
| Victoria normal (2-1)             | 3 puntos  |
| Victoria con 3 coronas (3-0, 3-2) | 4 puntos  |
| Derrota                           | 0 puntos  |
| Sanción                           | −2 puntos |

Y los bordes: los diez marcadores válidos, 3-3 rechazado, coronas fuera de
rango, coronas no enteras, empate rechazado mientras la regla siga pendiente, y
un caso con reglamento modificado que demuestra que los puntos se recalculan
sin tocar datos.

## Clasificación

- PJ, VG, VP, CF, CC, DC y PTS sobre escenarios pequeños y verificables a mano.
- Sanciones: se restan de PTS sin tocar los puntos deportivos, se acumulan, las
  anuladas se ignoran, y un jugador puede quedar en negativo.
- Desempates: por DC, por enfrentamiento directo entre dos, y **triple empate
  resuelto por mini-liga**.
- Empate irresoluble: posición compartida y marca `unresolvedTie`.
- Reconstrucción: la tabla de una jornada anterior (`upToRound`) y la tabla tras
  eliminar o corregir un resultado.

## Temporada completa

Un test recorre el ciclo entero con los seis participantes reales y cuatro
plazas de relleno: no deja cerrar la plantilla con 6, la cierra con 10, genera
el calendario, lo valida, juega los 90 partidos y comprueba invariantes
globales:

- Los 10 jugadores terminan con 18 partidos.
- Las coronas cuadran: lo que unos hacen es exactamente lo que otros reciben, y
  la suma de todas las DC es 0.
- El total de puntos repartidos coincide con la suma de 3 o 4 por partido según
  el tipo de victoria.
- Las posiciones van de 1 a 10 sin empates sin resolver.
- Una sanción cambia la tabla sin tocar los puntos deportivos.
- Corregir un resultado rehace la tabla correctamente.

## API

Se comprueba que la configuración tiene valores por defecto seguros, que
**serializar la configuración no filtra el token de Clash Royale**, que
`DATABASE_URL` es obligatoria en producción y que los dos endpoints responden lo
que dicen responder.

## Integración (Fase 1)

### Esquema

12 tests comprueban que **la base de datos** rechaza por sí sola lo que no debe
entrar, aunque alguien salte el dominio y escriba SQL directamente: dos
confirmados en la misma plaza, un jugador con plaza sin estar confirmado, un tag
de Clash Royale repetido, un jugador contra sí mismo, el mismo enfrentamiento
repetido con la misma condición de local, una sanción que sume puntos y una
sanción con el motivo vacío.

### API

De punta a punta, con sesión real y base de datos real:

- **Seguridad**: lectura pública, escritura rechazada sin sesión, cookie
  inventada rechazada, credenciales incorrectas indistinguibles entre sí, cookie
  httpOnly + SameSite=Lax, validación de entrada, identificador de petición en
  cada error.
- **Participantes**: alta, edición, confirmación, plazas TBD, nombres
  duplicados, 11.º confirmado rechazado, plaza liberada al desconfirmar,
  sustitución conservando plaza y rastro, y fixture bloqueado con menos de 10.
- **Fixture**: 18 jornadas, 5 partidos por jornada, 90 partidos, cada pareja dos
  veces con condición invertida, semilla guardada, regeneración accidental
  bloqueada y generación auditada.
- **Puntuación**: 3-0, 3-1 y 3-2 dan 4 puntos; 2-0 y 2-1 dan 3; la derrota 0.
  Marcadores imposibles, empates y walkovers pendientes se rechazan.
- **Correcciones**: la revisión conserva el valor anterior y la tabla se rehace.
- **Sanciones**: -2 sin tocar los puntos deportivos, anulación que los devuelve,
  y sanción positiva rechazada.
- **Aplazamientos**: POSTPONED no suma PJ, ni puntos, ni coronas; conserva
  jornada y fecha original; no admite resultado; se reprograma; se juega después
  y entonces sí actualiza la clasificación.
- **Disputas**: reportes coincidentes validan el resultado, contradictorios
  llevan a DISPUTED, un partido en disputa no puntúa, y el administrador lo
  resuelve.
- **Auditoría**: todas las acciones quedan registradas con autor y datos, y la
  auditoría no es visible sin sesión.

## Lo que todavía no se prueba

Honestidad sobre los huecos:

- **Las migraciones no se han aplicado contra el PostgreSQL nativo** en este
  entorno: Docker Desktop no llegó a arrancar. Se han aplicado contra PGlite,
  que es PostgreSQL, pero conviene ejecutar `npm run db:up && npm run db:migrate`
  antes de desplegar.
- No hay tests end-to-end de navegador; el panel se verificó manualmente
  (login, generación de calendario, resultados, clasificación).
- No hay tests contra la API de Clash Royale; se harán con respuestas grabadas,
  nunca contra el servicio real en CI.

## Convenciones

- Cada test comprueba una cosa y su nombre dice cuál, en español.
- Los errores del dominio se verifican por `code`, nunca por el texto del
  mensaje (`expectDomainError` en `test/helpers.ts`).
- Sin `mocks` en el dominio: es puro, no hay nada que simular.
- Los datos de prueba no inventan participantes reales más allá de los seis
  confirmados; las plazas de relleno se llaman `Jugador 7`…`Jugador 10`.
