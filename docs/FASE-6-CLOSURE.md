# Fase 6 · Informe de cierre

**Fecha:** 13 de septiembre de 2026
**Estado:** cerrada
**Objetivo:** dejar la plataforma lista para operar la liga de verdad.

---

## Resumen en una página

Las fases anteriores dejaron la plataforma **correcta** (4), **operable** (5) y
**presentable** (6.0–6.10). Esta cierra lo que faltaba para que una persona
concreta pueda llevar una liga concreta: una base de datos que no depende de
Docker, un administrador real, nombres editables con la temporada en marcha, un
directo que no miente y un calendario que se programa como se juega.

Cuatro cosas cambiaron de raíz:

1. **La liga arranca con un comando.** `npm run liga`. La base de datos vive en
   una carpeta del proyecto, con las mismas migraciones que un PostgreSQL
   nativo. Obligar a arrancar Docker antes de cada jornada era una forma segura
   de que un sábado no arrancara.

2. **El directo se comprueba, no se declara.** El aviso solo aparece cuando el
   canal de Kick está emitiendo **Clash Royale** y además hay partidos de la
   liga en juego. Si no se puede comprobar, no se anuncia nada.

3. **Los nombres se pueden corregir con la liga empezada.** Quién compite sigue
   fijado en cuanto hay calendario; cómo se llama, no.

4. **La temporada se programa en sesiones.** Tres jornadas cada sábado, que es
   como se juega esta liga.

### Verificación

`npm run verify` pasa en verde. `npm run e2e`: 145 comprobaciones, 0 fallidas.

| Suite                             | Fase 5  | Fase 6  |
| --------------------------------- | ------- | ------- |
| `@liga/contracts`                 | 12      | 12      |
| `@liga/domain`                    | 250     | 250     |
| `@liga/api`                       | 341     | 367     |
| `@liga/web`                       | 139     | 151     |
| **Total unitarios e integración** | **742** | **780** |
| `npm run e2e`                     | 121     | 145     |

---

## Qué se hizo

### 6.1 · El narrador y su sección

`apps/web/src/lib/streamer.ts` reúne los cuatro canales de **EsstebannPluss** en
un solo sitio, porque aparecen en la portada, en `/transmision`, en el aviso de
directo y en la ficha de un partido en juego.

Tres decisiones sobre el texto:

- **No publica cifras de seguidores.** Cambian cada semana y convierten una
  presentación en un boletín de resultados ajeno. Hay un test que lo impide.
- **Habla de lo que hace, no de quién es.** Se escribió después de mirar sus
  perfiles públicos; no se le inventó biografía.
- **Dice que la liga no gestiona esos canales.** Son de otra persona.

### 6.2 · El trofeo

De 1,4 MB a **44 KB** en WebP, dos tamaños y PNG de reserva. Entra girando y
flota despacio. Los iconos de la PWA se generan a partir de él.

### 6.3 · Temporada limpia

`npm run demo` arranca con el calendario generado y **cero resultados**: el
estado con el que se publica una liga. Los datos de demostración se movieron a
`npm run demo:datos`, que es lo que usan las pruebas de extremo a extremo.

Mezclarlos habría acabado enseñando resultados de mentira en una liga real.

### 6.4 · Movimiento, sonido y PWA

GSAP con ScrollTrigger, transiciones de vista, efectos cyberpunk, sonido
sintetizado con la Web Audio API y una PWA instalable. Todo el detalle en
[transmision.md](transmision.md).

Lo que importa de ahí:

- **`prefers-reduced-motion` apaga movimiento y sonido.** Quien pide menos
  estímulo no se refería solo a lo que se mueve.
- **El sonido empieza apagado.** El navegador no deja arrancar audio sin un
  gesto del usuario: el clic en el interruptor **es** ese gesto.
- **El service worker nunca cachea `/api/`.** Una clasificación guardada es una
  clasificación que miente: la tabla se deriva y se recalcula entera.

### 6.5 · Base de datos sin Docker

`packages/database/src/local.ts`. `DATABASE_URL=file:./datos/liga` abre PGlite
—PostgreSQL compilado a WebAssembly, el mismo que usan los tests— sobre una
carpeta, y aplica las migraciones al arrancar.

Migrar al abrir es deliberado: con un archivo local no hay un paso de despliegue
donde meter `db:migrate`, y arrancar contra un esquema viejo fallaría más tarde
y peor.

**Limitación real:** PGlite abre la carpeta en exclusiva. Solo puede haber un
servidor encendido a la vez. Para varias instancias sigue estando
`createDatabase` contra PostgreSQL nativo, y las dos comparten migraciones.

### 6.6 · Administrador real

`nimajneb.zap.41@gmail.com`, rol `OWNER`. La contraseña vive en `.env` y no
aparece en ningún otro sitio.

El `.env` tenía **`CLASH_ROYALE_API_TOKEN` duplicado** —uno vacío arriba y el
real al final— y le faltaba `CLASH_ROYALE_ENABLED`. Quedó reescrito y agrupado,
con copia de seguridad ignorada por Git.

### 6.7 · Renombrar con la liga en marcha

Capacidad nueva: **`RENAME_PLAYER`**, separada de `MANAGE_ROSTER`.

| Estado       | Añadir/quitar gente | Renombrar |
| ------------ | ------------------- | --------- |
| DRAFT        | Sí                  | Sí        |
| REGISTRATION | Sí                  | Sí        |
| READY        | Sí                  | Sí        |
| SCHEDULED    | **No**              | **Sí**    |
| LIVE         | **No**              | **Sí**    |
| FINISHED     | No                  | No        |

Quién compite queda fijado en cuanto hay calendario: cambiarlo dejaría partidos
apuntando a gente que ya no juega. **Cómo se llama** es una etiqueta que no mueve
un solo partido ni un solo punto, y en una liga de amigos los apodos cambian a
mitad de temporada.

En `FINISHED` tampoco se tocan: la instantánea guarda la clasificación con los
nombres de entonces, y cambiarlos después haría que el acta y la pantalla
dijeran cosas distintas.

### 6.8 · Directo comprobado

`apps/api/src/integrations/kick/client.ts` y `services/broadcast.ts`.

El aviso se enciende **solo** cuando las dos condiciones se cumplen:

| Condición                        | Quién lo sabe |
| -------------------------------- | ------------- |
| El canal emite Clash Royale      | Kick          |
| Hay partidos de la liga en juego | Nosotros      |

Con una sola se mentiría en las dos direcciones: emitir Fortnite no es
retransmitir la liga, y un partido marcado en juego con el canal apagado no se
puede ver en ninguna parte.

**`UNKNOWN` no es `OFFLINE`.** La API pública de Kick no está documentada
oficialmente. Si cambia la forma del JSON, el sistema dice que no pudo
comprobarlo, no que nadie esté emitiendo. Ante la duda, la web no anuncia nada.

Lleva caché de 45 s y cortafuegos: cada visita a la portada consulta esto, y sin
caché serían miles de llamadas a un servicio ajeno.

### 6.9 · Tres jornadas cada sábado

`POST /api/v1/admin/rounds/schedule-season` y su formulario en
`/admin/jornadas`. Dieciocho jornadas salen en seis sesiones de quince partidos.

El formulario enseña la cuenta antes de enviar nada —cuántas sesiones, cuántos
partidos, cuánto dura un día— porque «tres jornadas el sábado» suena razonable
hasta que se ve que son siete horas y media seguidas.

Respeta las mismas reglas que programar una jornada suelta: **solo toca partidos
en `SCHEDULED`** y **no pisa una fecha ya puesta** salvo que se marque. Un
horario acordado con dos jugadores no se borra por programar en bloque.

---

## Lo que esta fase decidió no hacer

- **No se cerró ninguna regla pendiente.** Siguen las diez.
- **No se amplió ningún rango de IP** en el portal de Supercell. La clave
  responde `accessDenied.invalidIp` y eso lo resuelve quien administra la cuenta.
- **No se encendió la sincronización automática.** Sigue en `false`: la
  retención real del historial de Clash Royale no está medida, y una frecuencia
  inventada solo produce peticiones a ciegas.
- **No se registró ningún resultado automáticamente.** Ver abajo.

---

## Lo que la integración con Clash Royale **sí** hace, y lo que no

Esto se malinterpreta con facilidad, así que conviene dejarlo escrito.

Poner el tag de un participante **no hace que sus resultados aparezcan solos**.
El flujo completo es:

1. Un administrador lanza la sincronización de un participante.
2. Se lee su historial de batallas con la API oficial.
3. Las batallas que encajan con un partido del calendario se guardan como
   **candidatas**, con su confianza y sus ambigüedades.
4. **Un administrador las confirma o las descarta.** Solo al confirmar se
   registra el resultado, y lo hace llamando al mismo servicio que un resultado
   escrito a mano.

Los pasos 1 y 4 son de una persona a propósito:

- El historial de Clash Royale es **evidencia observada**, no un acta. Una
  batalla amistosa entre dos participantes fuera de la liga tiene exactamente la
  misma forma que una de competición.
- **P-11 sigue abierta**: vincular un tag no es verificar que esa cuenta sea de
  esa persona. No existe verificación oficial disponible para este flujo.

Que la clasificación de una liga real dependiera de una coincidencia automática
sería el error más caro que podría cometer este sistema.

---

## Deuda conocida

- **PGlite es de un solo proceso.** Dos servidores contra la misma carpeta no
  arrancan. Para la liga es irrelevante; para un despliegue con réplicas, no.
- **La IP del token de Supercell.** En una conexión doméstica cambia sola, así
  que la sincronización puede dejar de funcionar un sábado cualquiera. Degrada
  sin romper nada —ningún resultado depende de ella— pero conviene saberlo.
- **La API de Kick no está documentada.** Puede cambiar sin aviso. El sistema
  está construido para tratar eso como «no lo sé» y seguir funcionando, y se
  apaga con `BROADCAST_CHECK_ENABLED=false`.
- **Las revisiones de partido viven en memoria.** Con varias instancias cada una
  llevaría su cuenta; el efecto sería un refresco de más, no un dato incorrecto.
- **`fileParallelism: false`** en los tests de la API. Serializar cuesta ~100 s;
  la alternativa era una suite que fallaba sin decir en qué test.

---

## Reglas pendientes

Diez abiertas. Ver [pending-rules.md](pending-rules.md). Ninguna bloquea jugar:
la única que lo hacía era **P-01**, cerrada en la Fase 4 como **R-09**.
