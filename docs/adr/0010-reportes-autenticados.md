# ADR 0010 — El reporte de resultados exige sesión en la Fase 1

**Estado:** aceptada · 2026-09-08

## Contexto

El flujo acordado es que cada jugador reporte el marcador y, si ambos coinciden,
el resultado quede validado; si se contradicen, el partido pasa a `DISPUTED` y
lo resuelve un administrador.

El boceto de endpoints situaba `POST /api/v1/matches/:id/report-result` como
ruta pública. El problema es que en la Fase 1 **no existe identidad de jugador**:
no hay cuentas, ni contraseñas, ni tokens por participante. Una ruta pública que
acepta `playerId` en el cuerpo es un endpoint de escritura sin autenticar sobre
una competición real: cualquiera con la URL podría reportar resultados de
partidos ajenos, y bastaría con reportar dos veces desde ambos lados para
fabricar un resultado oficial.

## Decisión

En la Fase 1 el reporte vive en `POST /api/v1/admin/matches/:id/report-result` y
exige sesión de administrador o árbitro, que indica de qué jugador es cada
reporte.

El mecanismo de conciliación es el acordado y está implementado y probado en el
dominio: coinciden → `COMPLETED`, se contradicen → `DISPUTED`. Lo único que
queda pendiente es **quién puede pulsar el botón**.

## Alternativas descartadas

- **Dejar la ruta pública.** Inaceptable en una liga con premio y transmisión.
- **Cuentas de jugador completas ahora.** Registro, contraseñas, recuperación y
  panel de jugador. Es un bloque de trabajo propio y la Fase 1 ya tiene alcance
  suficiente.
- **Un token por partido enviado por chat.** Resuelve la autenticación sin
  cuentas, pero exige distribuirlo y revocarlo, y decidir qué pasa si se
  reenvía. Es una opción razonable para la Fase 2; no una que convenga
  improvisar ahora.

## Consecuencias

- Ningún endpoint de escritura queda sin autenticar.
- El flujo de doble reporte y disputa funciona hoy, con el administrador
  introduciendo lo que cada jugador comunica.
- **Pendiente para la Fase 2**: identidad de jugador (cuenta o token por
  participante) para que reporten ellos mismos. La API no cambiará de forma: solo
  cambiará quién está autorizado a llamarla.
