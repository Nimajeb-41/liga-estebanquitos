# Integración con Clash Royale

**Estado: activa.** El spike del 10 de septiembre de 2026 confirmó que la API
devuelve lo necesario, y sobre esa evidencia se construyó la integración.

Lo que hace: importa batallas, las normaliza, las guarda en tablas propias y
**propone** candidatos a resultado. Lo que no hace, y no va a hacer: confirmar
un resultado oficial sin que un administrador lo decida.

Documentación completa en
[docs/clash-royale-integration.md](../../../../../docs/clash-royale-integration.md).

## Por qué vive en el backend

El token del portal de desarrolladores **está ligado a una lista de IP** que se
declara al crearlo. Desde un navegador no funcionaría, y aunque funcionase,
exponerlo sería regalar la clave.

```
Frontend  →  Nuestro backend  →  api.clashroyale.com
```

Nunca:

```
Frontend  →  api.clashroyale.com
```

El token entra por `CLASH_ROYALE_API_TOKEN` y no sale de aquí: no se registra en
los logs, no viaja en ninguna respuesta y no aparece en `/health`, que solo dice
si está configurado o no.

## Qué hay

| Archivo     | Qué resuelve                                                                     |
| ----------- | -------------------------------------------------------------------------------- |
| `types.ts`  | Las formas verificadas de la API. Ni un campo inventado.                         |
| `client.ts` | Autenticación, normalización de etiquetas, 403 por IP, 429 con espera creciente. |
| `mapper.ts` | Traduce una batalla en un **candidato** a resultado. Propone; no decide.         |

## Lo que este código no hace, a propósito

- **No registra resultados.** `mapper.ts` devuelve candidatos; confirmarlos es
  una acción administrativa que pasa por los mismos servicios que todo lo demás,
  con su auditoría.
- **No inventa coronas.** Si la batalla no las trae, devuelve `MISSING_CROWNS`.
- **No adivina el emparejamiento.** Si las etiquetas no son las de los dos
  jugadores del partido, devuelve `PLAYERS_DO_NOT_MATCH`.
- **No asume un límite de peticiones.** Los umbrales no están publicados, así
  que se respeta el 429 y `retry-after` en lugar de inventar una cuota.

## Antes de activarla: el spike

Tres dudas de impacto alto siguen **sin verificar**, y las tres se despejan a la
vez jugando una amistosa entre dos cuentas de prueba y mirando el `battlelog` de
ambas:

1. ¿Aparecen las batallas amistosas, y con qué valor de `type`?
2. ¿Cuántas batallas devuelve el historial?
3. ¿Cuánto tiempo se conservan?

Si la primera respuesta es que no aparecen, la importación de resultados no es
viable y esta integración se queda en enriquecer la ficha del jugador: perfil,
mazo actual y verificación de identidad.

Detalle completo de la investigación en
[docs/clash-royale-api.md](../../../../../docs/clash-royale-api.md).

## Reglas pendientes que la afectan

- **P-04 · mazos entre partidas.** El modelo de datos (`decks`, `deck_cards`) ya
  está listo, pero hasta que se decida si se puede cambiar de mazo y si hay que
  declararlo antes de jugar, importar un mazo no significa nada normativo.
- **P-11 · identidad de jugador.** `POST /players/{tag}/verifytoken` permitiría
  que cada participante demostrase que la cuenta es suya, pero **no está
  documentado por Supercell**: es una capacidad no oficial y sin garantía, que
  puede desaparecer sin aviso. Apoyar P-11 en ella es una decisión de producto,
  no técnica, y hasta que se tome **el flujo de identidad no se implementa**.
