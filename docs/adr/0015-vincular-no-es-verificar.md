# ADR 0015 — Vincular una cuenta no es verificar su propiedad

**Estado:** aceptada · 2026-09-10

## Contexto

Para cruzar el historial de batallas con el calendario hace falta saber qué
cuenta de Clash Royale corresponde a cada participante. Eso es **vincular**.

Cosa distinta es **verificar**: comprobar que la cuenta pertenece de verdad a esa
persona y no a otra. Lo permitiría `POST /players/{tag}/verifytoken`, con el
token de un solo uso que el juego genera.

Pero ese endpoint **no está documentado por Supercell**. Se comprobó el 9 de
septiembre de 2026: el portal de desarrolladores no incluye ningún endpoint de
verificación de cuenta, y hay peticiones abiertas de la comunidad para que lo
documente. Existe y lo usan servicios de terceros, pero como capacidad no
oficial: puede cambiar o desaparecer sin aviso y sin ruta de migración.

Y la verificación de identidad es exactamente **P-11**, una regla pendiente.

## Decisión

**El sistema vincula y no verifica**, y lo dice en todas partes.

- La vinculación nace `UNVERIFIED` y se queda ahí. El valor `VERIFIED` existe en
  el enumerado, para no tener que migrar el día que se decida, pero **ningún
  camino del código lo asigna**. Hay test.
- La columna `players.clash_tag_verified_at` sigue siendo NULL siempre, y no por
  descuido.
- Lo que sí se comprueba es que **la cuenta existe**: al vincular se consulta el
  perfil y se guarda su nombre, para que un administrador reconozca lo que está
  vinculando. Que exista es comprobable; que sea suya, no.
- Dos participantes no pueden reclamar la misma etiqueta. Lo impide el servicio
  y lo fuerza un índice único.
- La interfaz lo dice con todas las letras, en el panel y en el perfil público:
  la cuenta está **declarada, no comprobada**.

**Esto no cierra P-11.** Un participante podría declarar la etiqueta de otro y el
sistema no lo detectaría. Es una limitación real, no un detalle de
implementación, y por eso está escrita donde se ve.

## El Player Tag no es el nombre del jugador

Decisión relacionada, y conviene dejarla escrita porque es fácil de erosionar:

- `players.display_name` es el nombre en la liga. Manda en la clasificación, el
  calendario, el Match Center y toda la interfaz pública.
- `players.clash_tag` y `players.clash_name` son datos de la cuenta externa.
  Sirven para cruzar información, no para identificar a nadie ante el público.

Un nombre de Clash Royale **nunca** sustituye al de la liga. Hay test.

## Alternativas descartadas

- **Usar `verifytoken` igualmente.** Apoyar la identidad del torneo en una
  capacidad que el proveedor no documenta es asumir un riesgo que no nos toca
  asumir a nosotros: es una decisión de producto del administrador. El código
  queda preparado; la decisión, pendiente.
- **Llamar «verificada» a la vinculación porque la cuenta existe.** Sería
  mentir con precisión técnica. Existir y pertenecer son cosas distintas.
- **No vincular hasta poder verificar.** Bloquearía toda la integración por una
  regla pendiente, y la vinculación sin verificar ya es útil: un administrador
  que conoce a los diez participantes sabe perfectamente de quién es cada
  cuenta.
- **Una tabla `clash_royale_accounts` aparte.** `players.clash_tag` ya existía
  desde la Fase 0, con su índice único por torneo. Duplicarlo habría creado dos
  sitios donde vive el mismo hecho, que es justo lo que este proyecto evita. La
  información de la vinculación —estado, fecha, última sincronización, nombre de
  la cuenta— vive como columnas del participante, con el que tiene una relación
  estrictamente uno a uno.

## Consecuencias

- La integración funciona hoy, sin depender de nada no documentado.
- El riesgo queda visible para quien tenga que decidir, en lugar de enterrado.
- **Coste asumido:** vincular exige confianza en el administrador que lo hace.
  En una liga de diez personas que se conocen, es asumible; en una abierta, no
  lo sería.
- Cuando se decida **P-11**, hay dos caminos: aceptar `verifytoken` con su riesgo
  —y entonces `VERIFIED` empieza a asignarse—, o dejar constancia de que la
  vinculación es declarativa y basta.
