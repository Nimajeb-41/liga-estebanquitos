# Fase 4 · Informe de cierre

**Fecha:** 10 de septiembre de 2026
**Estado:** cerrada
**Objetivo:** llevar la plataforma de «funcional» a «lista para operar una
competición real».

---

## Resumen en una página

Se completaron las quince secciones de la fase, en el orden mandado. Lo que
cambió no es la cantidad de pantallas —eso ya estaba— sino tres cosas:

1. **La plataforma ahora puede explicarse.** Auditoría filtrable con el
   identificador de la petición, métricas de operación, `/health` y `/readiness`
   separados. Antes se podía preguntar «¿qué pasó?» y la respuesta era mirar la
   base de datos.

2. **Lo observado y lo oficial ya no se pueden confundir.** La separación existía
   en la cabeza de quien escribió el código; ahora la imponen los tipos, la
   viajan las respuestas (`source` + `sampleSize`) y la enseña la interfaz con la
   misma etiqueta en las seis pantallas donde aparece.

3. **Se puede operar sin abrir una terminal.** Cancelar un partido, gestionar
   enlaces de transmisión, generar el overlay de OBS, revisar la auditoría,
   lanzar una vuelta de sincronización.

Ninguna regla pendiente se cerró. Siguen las once.

### Verificación

`npm run verify` pasa en verde: auditoría de secretos, auditoría de índices,
formato, lint, tipos, tests y build.

| Suite                                               | Tests   |
| --------------------------------------------------- | ------- |
| `@liga/domain`                                      | 203     |
| `@liga/database`                                    | 12      |
| `@liga/api`                                         | 265     |
| `@liga/web`                                         | 129     |
| **Total unitarios e integración**                   | **609** |
| `npm run e2e` (comprobaciones de extremo a extremo) | 108     |

---

## Qué se hizo, sección por sección

### 4.0 · Auditoría de seguridad

`scripts/audit-secrets.mjs`: recorre lo versionable buscando formas de secreto
—JWT, `Bearer`, claves privadas, contraseñas literales— y comprueba
estructuralmente `.env.example` y `.gitignore`. **Nunca imprime el valor**: dice
archivo, línea y tipo. Va el primero dentro de `npm run verify`.

Existe porque el error ya ocurrió: en la Fase 3 un token real acabó en
`.env.example`. Ese token debe darse por comprometido y no reutilizarse.

### 4.1 · Análisis de cierre de reglas pendientes

Se analizaron las once (**P-01** a **P-11**) y **las once siguen abiertas**. El
análisis está en [pending-rules.md](pending-rules.md) con, para cada una, qué
evidencia nueva de la Fase 3 ayuda y qué sigue faltando.

Lo urgente, dicho sin rodeos: **P-01** ya está bloqueando —no se puede registrar
una incomparecencia— y **P-05**/**P-06** dejan de ser teóricas en el momento en
que alguien abandone la liga a mitad de temporada.

### 4.2 · Observación de retención

`npm run clash:retention` registra observaciones de si una batalla concreta sigue
apareciendo en el historial, y con qué antigüedad. El informe da **cota inferior**
(la mayor antigüedad vista con la batalla aún presente) y **cota superior**, que
dice «sin determinar» mientras ninguna haya desaparecido.

También registra los fallos, para que un 403 no se confunda con «la batalla
desapareció». Necesita `DATABASE_URL` porque compara entre ejecuciones separadas
por horas.

Hoy la única cota medida sigue siendo **≥ 41,4 h**.

### 4.3 · Dominio de estadísticas

`packages/domain/src/statistics/`. `computePlayerStatistics` y `leadersBy`, con
las decisiones que hacen que un número no mienta:

- solo cuentan los `COMPLETED`, preguntándoselo a `countsForStandings`;
- `null` cuando no hay datos, nunca `0`;
- la racha actual y la mejor son cosas distintas;
- los puntos los reparte `pointsForResult`; si una regla pendiente lo impide, ese
  partido no aporta puntos en lugar de aportar un cero con significado;
- `leadersBy` devuelve **todos** los empatados, y los `null` nunca ganan.

### 4.4 · Estadísticas por jugador

`/estadisticas` y la ficha de `/jugadores/:id` reescrita en tres bloques
etiquetados: identidad, oficial y observado. Rendimiento completo (porcentajes,
coronas, victorias por tres coronas, rachas, local/visitante), historial completo
con los partidos que aún no cuentan mostrados **sin marcador**, y evidencia
externa claramente separada.

Nada de lo observado sube de categoría por aparecer en esa página.

### 4.5 · Analítica de mazos

`/cartas` con filtros, y mazos observados por participante con cartas más
repetidas y media de elixir. La media solo se calcula si el catálogo conoce el
coste de las ocho cartas: una media con huecos no es una media.

**Hallazgo de privacidad:** el rival de una batalla observada puede ser cualquiera,
no solo un participante. Se añadió `maskClashTag` en el dominio y el servicio
ahora resuelve al participante cuando lo es —su tag ya es público porque lo
declaró— y **enmascara** el tag en cualquier otro caso, antes de que salga del
servidor.

### 4.6 · Match Center 2.0

Número de partido dentro de la jornada en la cabecera, y aviso explícito para los
**seis** estados —incluidos los tres «tranquilos», porque el silencio también se
interpreta y un cancelado sin explicación se lee como un fallo de la página—.
Cada aviso dice si el partido cuenta en la clasificación.

Detalle de aplazamiento con jornada original, fecha original, recuento y la lista
de movimientos con su motivo. Las notas internas no salen.

La etiqueta de procedencia se unificó en `SourceBadge`, con una sola definición
para React y Astro.

### 4.7 · Control administrativo avanzado

Dos operaciones que faltaban y que una liga real necesita:

- **Cancelar un partido**. Es la única operación irreversible del calendario —el
  dominio no deja salir de `CANCELLED`—, así que exige motivo por escrito y una
  confirmación tecleada. Existe porque la alternativa que se usaría si no
  existiera es peor: dejar los partidos aplazados para siempre, contaminando cada
  pantalla que cuenta pendientes.
- **Enlaces de transmisión** (directo, VOD, plataforma), validados a `http`/`https`
  porque un `javascript:` acabaría pegado en un `href` de la ficha pública.

Además, la tarjeta de resultado se llama «Resolver la disputa» cuando el partido
está en disputa, con los reportes de los dos jugadores a la vista.

### 4.8 · Modo transmisión

`/admin/stream` genera la URL del overlay con vista previa sobre un tablero de
transparencia. `/overlay/match/:id` es la fuente de navegador para OBS: fondo
transparente, tipografía grande con sombra doble, sin interacción, `noindex`, y
se actualiza sola cada diez segundos.

**Lo que no hace: inventar un marcador.** Sin resultado registrado pone `VS`, no
un `0–0` que a ese tamaño se leería como real.

**Fallo encontrado y corregido durante la verificación en el navegador:** el
overlay arrancaba con `opacity: 0` en el `style` de React y GSAP lo animaba a 1;
cada repintado del sondeo volvía a aplicar el cero y lo dejaba invisible. Ahora
parte de visible y es GSAP quien lo pone a cero para animarlo: si GSAP no llega,
simplemente no hay animación en vez de una fuente en blanco durante todo el
directo.

### 4.9 · Arquitectura de sincronización

Planificador con cortacircuitos, **apagado por defecto**. No por prudencia
genérica: no sabemos cada cuánto hay que sincronizar, porque la retención real
del historial solo tiene cota inferior. Encenderlo con un intervalo inventado
sería fingir que conocemos un número que no conocemos.

Cuando se encienda: pocos participantes por vuelta empezando por los que llevan
más tiempo sin consultarse, **no confirma nada**, y se corta sola tras N fallos
seguidos. Estado consultable desde el panel y desde `/health`.

**Fallo encontrado y corregido:** la configuración leía las variables de Clash
Royale **después** de comprobar los problemas, así que un
`CLASH_ROYALE_TIMEOUT_MS=abc` se tragaba en silencio y el servidor arrancaba con
el valor por defecto sin decir nada. Ahora impide el arranque.

### 4.10 · Auditoría y observabilidad

`/admin/auditoria` con filtros por acción, responsable, tipo de entidad,
identificador, rango de fechas y `requestId`. Los filtros son un formulario GET
normal: funcionan sin JavaScript y cada búsqueda tiene su URL. Se aplican en la
base de datos, no en el navegador.

Nueva columna `request_id` en `audit_log` (migración `0005`), rellenada
automáticamente por `currentAdmin`: no hay forma de llegar a un servicio
administrativo sin pasar por ahí, así que **toda** operación la lleva.

Métricas de operación en `/api/v1/admin/metrics`, y `/health` + `/readiness`
separados.

### 4.11 · Responsive, accesibilidad y rendimiento

**Índices.** `scripts/audit-indexes.mjs` compara cada clave ajena con la primera
columna de cada índice —que es la única que sirve para buscar sola—. Encontró 17
sin cubrir; se añadieron 9 (migración `0006`), las que apuntan a tablas de las que
la aplicación borra de verdad, y se documentaron 8 excepciones con su motivo. El
script está en `npm run verify`.

**Accesibilidad.** `scripts/a11y-checks.mjs`, ejecutado sobre siete pantallas
dentro de `npm run e2e`: idioma, encabezados, nombres accesibles, etiquetas de
formulario, encabezados de tabla y viewport ampliable.
**Encontró que el Match Center no tenía `<h1>`**: quien navega por encabezados no
tenía por dónde entrar a esa pantalla. Corregido.

**Desbordamiento horizontal en móvil.** Verificado en el navegador a 375 px. Se
encontraron dos causas reales y se corrigieron las dos:

- Un `<span class="sr-only">` dentro de una tabla ancha con scroll: al ser
  `position: absolute` sin ancestro posicionado, no lo recortaba el contenedor
  con scroll y estiraba el documento entero. **La portada se podía desplazar
  130 px hacia un vacío.** Se corrigió haciendo `relative` los diez contenedores
  con scroll horizontal.
- La tabla local/visitante de la ficha de jugador, cuyo elemento de rejilla no
  podía encogerse por debajo del ancho mínimo de su contenido (`min-w-0`).

Verificado después: once pantallas públicas a 375 px, ninguna desborda.

### 4.12 · Regresión de seguridad

Barrido con un token de prueba configurado sobre trece rutas públicas, ocho
administrativas, los errores de validación, los 401, los 404 y el fallo de la
integración externa. Más la comprobación de que la integración está activa en ese
escenario, para que el test pueda fallar.

En `npm run e2e`, revisión de los paquetes JavaScript que se descarga el
navegador buscando la variable del token, cabeceras `Authorization` y cualquier
cadena con forma de JWT. Es la superficie que los tests de la API no ven.

### 4.13 · Testing

609 tests unitarios y de integración, 108 comprobaciones de extremo a extremo.
Los dos escenarios que la fase pedía explícitamente están cubiertos: crear
temporada → generar calendario → registrar resultado → la clasificación se mueve
(recorrido administrativo del e2e), y candidato rechazado → ningún resultado
oficial (`api-clash-royale.test.ts`).

### 4.14 · Documentación

Nuevos: [security.md](security.md), [statistics.md](statistics.md),
[streaming.md](streaming.md), [production.md](production.md), y este informe.

Actualizados: [architecture.md](architecture.md) (observabilidad y seguridad),
[pending-rules.md](pending-rules.md) (análisis de cierre de la fase).

---

## Fallos encontrados durante la fase

Ninguno de estos se detectó leyendo el código. Todos aparecieron al ejecutar algo.

| Qué                                                    | Cómo se encontró                              | Estado                       |
| ------------------------------------------------------ | --------------------------------------------- | ---------------------------- |
| El overlay se quedaba invisible tras el primer sondeo  | Verificación en el navegador                  | Corregido                    |
| Variables de entorno inválidas ignoradas en silencio   | Reordenar la validación al añadir opciones    | Corregido                    |
| `npm run demo` roto según desde dónde se lanzara       | Al arrancar la demo para verificar el overlay | Corregido                    |
| El Match Center no tenía `<h1>`                        | `scripts/a11y-checks.mjs`                     | Corregido                    |
| Desplazamiento lateral de 130 px en la portada móvil   | Medición en el navegador a 375 px             | Corregido                    |
| Tabla local/visitante desbordando 3 px                 | Medición en el navegador a 375 px             | Corregido                    |
| El tag de un rival no participante se publicaba entero | Revisión al escribir la analítica de mazos    | Corregido                    |
| 17 claves ajenas sin índice                            | `scripts/audit-indexes.mjs`                   | 9 corregidas, 8 documentadas |
| Regla de lint sobre asignación inútil en el dominio    | `npm run lint` completo                       | Corregido                    |
| `of()` en los tests del dominio erosionaba los tipos   | `tsc --noEmit` del workspace                  | Corregido                    |

---

## Lo que **no** se hizo, y por qué

**No se cerró ninguna regla pendiente.** Cerrarlas es una decisión de reglamento,
no de implementación. La plataforma sigue rechazando lo que dependería de ellas
con un `PENDING_RULE` explícito.

**No se implementó verificación de propiedad de cuenta.** Exigiría el endpoint
`verifytoken`, que Supercell no documenta. Vincular sigue sin ser verificar y
**P-11** sigue abierta.

**No se encendió la sincronización automática.** Falta medir la cota superior de
retención.

**No se amplió la lista de IP del token con rangos CIDR.** La configuración usa
exactamente el formato del portal oficial. Ampliar el alcance de una credencial
para no tener que actualizarla es cambiar seguridad por comodidad.

**No se implementó nada de la Fase 5.**

---

## Estado de la plataforma

Lista para operar una temporada real, con dos condiciones que no dependen del
código:

1. **Rotar el token de Clash Royale** y colocar el nuevo en `.env`, no en
   `.env.example`. El anterior debe darse por comprometido.
2. **Decidir P-01 antes de la primera incomparecencia.** Hoy la plataforma no
   deja registrarla, y eso es correcto: es preferible un error claro a un
   resultado que después nadie puede explicar. Pero significa que la primera vez
   que alguien no se presente, la jornada se queda bloqueada hasta que haya
   regla.

Lo demás —copias de seguridad, despliegue, arranque— está en
[production.md](production.md).
