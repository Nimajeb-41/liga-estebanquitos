# Roadmap

Una fase no empieza sin revisar la anterior.

## Fase 0 — Fundación (completada)

- [x] Monorepo, TypeScript estricto, Prettier, Vitest
- [x] Máquina de estados del torneo con capacidades por estado
- [x] Gestión de participantes: alta, edición, baja, confirmación, sustitución,
      plazas TBD
- [x] Generador de fixture round-robin con semilla reproducible
- [x] Validador de fixture con 12 comprobaciones
- [x] Validación de marcadores y derivación del resultado
- [x] Puntuación configurable (3 / 4 / 0 / −2)
- [x] Coronas y diferencia de coronas
- [x] Sanciones con anulación y trazabilidad
- [x] Clasificación con desempates configurables y mini-liga
- [x] Modelo de datos completo en PostgreSQL + migración inicial
- [x] Esqueleto de la API con configuración validada
- [x] 129 tests en verde
- [x] Documentación: arquitectura, reglamento, modelo de datos, fixture, API de
      Clash Royale, reglas pendientes, dirección visual, marca y testing
- [x] 7 decisiones de arquitectura registradas

**No entra en Fase 0**: interfaz web, fixture definitivo con los 10
participantes, datos inventados.

## Fase 1 — Persistencia, API y panel (completada)

- [x] Migraciones aplicadas y probadas contra PostgreSQL real
- [x] Capa de datos y capa de servicios, con transacciones
- [x] API REST versionada (`/api/v1`), pública en lectura y autenticada en
      escritura
- [x] Autenticación de administradores (Argon2id + sesiones) y roles
- [x] Validación declarativa de toda la entrada (Zod)
- [x] CRUD de participantes, confirmación, sustitución y plazas TBD
- [x] Generación del fixture oficial con semilla y auditoría
- [x] Resultados: registro, doble reporte, disputas y correcciones con revisión
- [x] Aplazamientos y reprogramaciones con historial y jornada original intacta
- [x] Sanciones con anulación
- [x] Clasificación derivada, no editable
- [x] `audit_log` escrito desde los servicios
- [x] Seguridad: Helmet, CSP, CORS, rate limiting, cookies httpOnly
- [x] Observabilidad: logging estructurado, request id, errores centralizados
- [x] Panel `/admin` funcional
- [x] Seed de desarrollo y servidor de demostración sin Docker
- [x] 229 tests en verde; lint, formato y typecheck limpios
- [x] Documentación: api.md, admin.md, development.md y tres ADR nuevas

**Reglas decididas en esta fase**: no hay empates, tolerancia de 15 minutos sin
efecto automático, aplazamiento sin penalización, doble reporte con disputa,
plazo de 24 horas y definición inicial de BM. Ver
[pending-rules.md](pending-rules.md).

## Fase 2 — Interfaz pública y panel (completada)

- [x] Astro con renderizado en servidor, React en islas, Tailwind 4 y GSAP
- [x] Sistema de diseño implementado ([design-system.md](design-system.md))
- [x] Portada, clasificación, calendario, jornadas, partidos, jugadores,
      estadísticas, sanciones, reglamento y sobre la liga
- [x] **Match Center** con estados, historial y sondeo en directo
- [x] Panel de administración en Astro, con la sesión reenviada por el servidor
      ([ADR 0011](adr/0011-panel-en-astro-con-bff.md))
- [x] Cliente de API centralizado y validado contra el contrato
- [x] Ficha pública de partido recortada: sin reportes, evidencia ni notas
      internas ([ADR 0012](adr/0012-ficha-publica-de-partido.md))
- [x] Reglas pendientes visibles como tales en toda la interfaz
- [x] Accesibilidad: tabla real, foco visible, `prefers-reduced-motion`, sin
      emojis como iconos
- [x] SEO: metadatos, Open Graph, `robots.txt` y sitemap con datos reales
- [x] Arquitectura de Clash Royale preparada, sin activar
- [x] 333 tests en verde y 56 comprobaciones de extremo a extremo
- [x] Documentación: frontend-architecture, design-system, api-client, fase-2 y
      dos ADR nuevas

**No entra en Fase 2**: llamadas reales a Clash Royale, WebSockets, PWA, ni
cerrar ninguna regla pendiente.

Sigue haciendo falta decidir **P-01** antes de la primera jornada oficial, y
**P-11** si se quiere que los participantes reporten ellos mismos. El logotipo y
el trofeo definitivos siguen pendientes de recibirse
([branding-and-assets.md](branding-and-assets.md)).

## Fase 3 — Integración con Clash Royale

> **Estado: completada.**
> Spike ejecutado el 10 de septiembre de 2026 con una amistosa real, e
> integración construida sobre su evidencia. Clash Royale aporta datos; la liga
> sigue decidiendo. Ver [clash-royale-integration.md](clash-royale-integration.md).
> Ver [clash-royale-spike.md](clash-royale-spike.md).

### Hecho

- [x] Auditoría e investigación de la documentación oficial vigente
- [x] Verificado contra la API real: URL base, autenticación por cabecera,
      cuerpo de error con `reason`, y que un token inválido y una IP no
      declarada producen **el mismo 403**
- [x] Corregido: `verifytoken` **no está documentado** por Supercell
- [x] Arnés del spike (`npm run spike:clash-royale`), que cuenta en vez de
      interpretar y no toca la base de datos ni el torneo
- [x] Validación de etiquetas de jugador, contra travesía de rutas
- [x] `getCards()` en el cliente, admitiendo las dos formas posibles
- [x] Seudonimización de fixtures y evidencia cruda fuera del repositorio
- [x] 343 tests en verde

### Lo que el spike confirmó

- [x] Las amistosas aparecen en **los dos** historiales, con el mismo `battleTime`
- [x] Coronas y tags en el 100 % de los lados observados
- [x] Mazos de 8 cartas y catálogo de 123 cartas
- [x] Retención de **al menos 41,4 h** — mayor que el plazo de impugnación
- [x] **No existe identificador de batalla**: hay que deduplicar por
      `(battleTime, tags ordenados)`

### Lo construido sobre esa evidencia

- [x] Cliente oficial con 403, 429 con `Retry-After`, 5xx, timeout y reintentos
- [x] Normalización defensiva: descarta lo inservible contando el motivo
- [x] **Deduplicación por huella determinista**, porque no hay `battleId`
      ([ADR 0014](adr/0014-huella-de-batalla.md))
- [x] Modelo externo aparte: `external_battles`, sus lados, sus cartas y los
      candidatos. No tocan `matches`, `match_results` ni `standings`
- [x] Detección de candidatos con motivos, ambigüedades y confianza explicable
- [x] **Revisión administrativa**: confirmar, rechazar o apartar
- [x] Confirmar llama a `recordResult`, el mismo servicio de siempre
      ([ADR 0013](adr/0013-clash-royale-como-evidencia.md))
- [x] Catálogo de 123 cartas y mazos de 8, mostrados en el Match Center
- [x] Vinculación de cuentas **sin fingir verificación**
      ([ADR 0015](adr/0015-vincular-no-es-verificar.md))
- [x] 437 tests en verde (eran 343 al terminar el spike)

**No entra en Fase 3**: confirmación automática de resultados, `verifytoken`,
sincronización programada, ni el cierre de ninguna regla P-01…P-11.

### Lo que sigue pendiente de decidir

1. **P-11**: asumir `verifytoken`, que no es oficial, o aceptar que la
   vinculación es declarativa.
2. **P-04**: qué reglas rigen los mazos, ahora que se pueden observar.
3. **Retención máxima**: repetir el spike unos días después con las mismas
   cuentas. Sin eso no se puede fijar una frecuencia de sincronización.

## Fase 4 — Directo y contenido

Con la evidencia externa ya disponible, la Fase 4 tiene más material del que
tenía cuando se escribió esta lista.

1. **Medir la retención** de Clash Royale y, con el dato, encender la
   sincronización programada.
2. Actualización en vivo de la tabla durante las transmisiones.
3. Superposiciones (_overlays_) para OBS alimentadas por la API, ahora también
   con mazos y cartas reales.
4. Estadísticas de temporada y récords, separando siempre las **oficiales** de
   las **observadas en Clash Royale**.
5. Archivo histórico de temporadas.

## Fase 5 — Temporada real, operación y producción (completada)

Informe completo en [FASE-5-CLOSURE.md](FASE-5-CLOSURE.md).

1. **P-01 cerrada** como concepto del dominio: una incomparecencia no es un
   marcador, y el ganador sale de quién faltó. Ver [walkover.md](walkover.md).
2. **Cierre de temporada con instantánea**, porque la tabla se deriva y
   cambiaría al configurar la temporada siguiente.
3. **Configuración del reglamento** con el formato bloqueado en cuanto existe
   calendario, y la versión del reglamento subiendo sola cuando un cambio
   recalcula la tabla hacia atrás.
4. **Operación de jornada** y **centro de acción**. Ver [operacion.md](operacion.md).
5. **Evolución de la tabla, cara a cara y récords de temporada**, todo derivado.
6. **Capa de eventos internos**, distinta de la auditoría y con su sondeo por
   revisión.

Lo que la fase decidió **no** hacer: cerrar ninguna otra regla pendiente.
Siguen las diez de [pending-rules.md](pending-rules.md).

## Sin fecha

- Segunda temporada con arrastre de historial entre temporadas.
- Fase eliminatoria posterior a la liga (`knockout`), si se decide.
- Aplicación móvil o PWA instalable.
