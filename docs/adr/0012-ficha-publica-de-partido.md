# ADR 0012 — La ficha pública de un partido es una proyección recortada

**Estado:** aceptada · 2026-09-08

## Contexto

`GET /api/v1/matches/:id` devolvía el historial completo del partido a cualquiera
que lo pidiese, sin sesión: los reportes de cada jugador con su URL de evidencia,
las notas escritas por administración al aplazar y el texto que justifica cada
corrección.

El propio contrato ya decía que los reportes son «solo visibles para
administración». El backend no lo cumplía. La Fase 2 lo descubrió al construir
el Match Center, que es el primer sitio donde esos datos se iban a pintar.

Tres problemas distintos, no uno:

1. **Evidencia y reportes.** Saber quién reportó qué y con qué captura es
   información de arbitraje. Publicarla invita a discutir el reporte en lugar de
   el resultado.
2. **Notas de aplazamiento.** Son texto libre y suelen describir la circunstancia
   personal de alguien: «se le cortó internet», «tenía un examen».
3. **Motivo de una corrección.** Publicarlo es una decisión de procedimiento, y
   ese procedimiento es **P-10**, todavía sin decidir. Publicarlo ahora sería
   cerrar la regla por la puerta de atrás.

## Decisión

Dos proyecciones, como ya se hacía con participantes y sanciones.

**Pública** (`GET /api/v1/matches/:id`):

- aplazamientos con el evento, la jornada, las dos fechas, el motivo
  **clasificado** (el enumerado, no el texto libre) y cuándo ocurrió;
- las correcciones, reducidas a **que existieron y cuándo**;
- el **número** de reportes recibidos, sin decir de quién.

**Administrativa** (`GET /api/v1/admin/matches/:id`, con sesión): todo, incluidas
las notas, los reportes con su evidencia y el motivo de cada corrección.

Que un resultado se corrigió **sí es público**, porque el marcador cambió a la
vista de todos y la tabla tiene que poder explicarse. Por qué se corrigió, hasta
que P-10 lo decida, no.

La ficha administrativa incorpora además `actions`: qué transiciones permite el
dominio ahora mismo y si el partido admite resultado o corrección. Así el panel
ofrece exactamente lo que el motor permite, sin deducirlo por su cuenta.

## Alternativas descartadas

- **Dejarlo como estaba.** Es una fuga de datos personales, y el contrato ya
  documentaba lo contrario.
- **Publicarlo todo, por transparencia.** La transparencia que necesita una liga
  es poder explicar la tabla, no exponer las circunstancias personales de un
  participante. Y en el caso de las correcciones, decide una regla pendiente.
- **Ocultar también que hubo una corrección.** Entonces el marcador cambiaría sin
  explicación visible, que es justo lo que el proyecto evita desde la Fase 0.
- **Filtrar en el frontend.** El dato ya habría salido del servidor. Quien mire
  la respuesta de la API lo ve igual.

## Consecuencias

- La ficha pública no expone evidencia, ni notas internas, ni motivos de
  corrección. Hay tests que lo comprueban, incluida una comprobación de que la
  respuesta serializada no contiene esas claves.
- El panel usa la ruta administrativa, que exige sesión.
- Cuando se cierre **P-10** habrá que revisar esta decisión: si el procedimiento
  dice que las correcciones se comunican públicamente, el motivo pasa a la
  proyección pública.
- **Coste asumido**: dos formas para la misma entidad y un endpoint más. Se
  reducen construyendo la pública a partir de la administrativa, en un solo sitio.
