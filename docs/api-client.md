# Cliente de la API

`apps/web/src/lib/api/`. Un único sitio conoce la URL base, las cabeceras, la
sesión y la forma de los errores. **Ningún componente hace `fetch` por su
cuenta.**

```
client.ts     HTTP: URL base, cabeceras, tiempos, errores
endpoints.ts  Una función por endpoint, validada contra el contrato
messages.ts   Códigos de error → español
session.ts    La cookie de sesión, vista desde el servidor de Astro
```

## `client.ts`

`request<T>(path, options)` y los tres errores que puede lanzar.

```ts
const tournament = await request<TournamentOverview>('/api/v1/tournament');
```

| Opción         | Para qué                                                    |
| -------------- | ----------------------------------------------------------- |
| `method`       | `GET` por defecto                                           |
| `body`         | Se serializa a JSON                                         |
| `cookie`       | Sesión que el servidor de Astro reenvía a la API            |
| `forwardedFor` | IP del visitante, para que el límite de intentos sea por IP |
| `signal`       | Cancelación                                                 |
| `timeoutMs`    | 8 s por defecto                                             |

Errores:

| Clase                 | Cuándo                                         |
| --------------------- | ---------------------------------------------- |
| `ApiError`            | La API respondió, pero con un error de negocio |
| `ApiUnreachableError` | No hubo respuesta: caída, red, tiempo agotado  |
| `ContractError`       | La respuesta no encaja en `@liga/contracts`    |

`ApiError` conserva `status`, `code`, `details` y `requestId`. Ese `requestId`
es el que aparece en los logs del servidor: con él se encuentra la petición
exacta.

**No lleva Zod a propósito.** La validación vive en `endpoints.ts`, que solo se
ejecuta en el servidor. Así el navegador no carga el validador para hacer un
sondeo.

### La URL base

```ts
apiBaseUrl(); // API_URL | PUBLIC_API_URL | http://127.0.0.1:3000
```

En el servidor se lee de **`process.env`**; en el navegador, de
`import.meta.env` (solo variables `PUBLIC_`).

La distinción no es cosmética: Astro resuelve `import.meta.env` **al compilar**.
Leyendo solo de ahí, una URL puesta al arrancar el proceso nunca llegaría, y la
misma build no se podría desplegar contra otra API. Este fallo lo encontró
`npm run e2e`, no una revisión de código.

## `endpoints.ts`

Una función por endpoint. Cada una **valida la respuesta contra el contrato**
antes de devolverla:

```ts
const standings = await getStandings({ upToRound: 5 });
const match = await getAdminMatch(id, { cookie });
```

Si el backend cambia una forma sin actualizar `@liga/contracts`, la página falla
aquí, con el campo y el motivo, en lugar de romperse a mitad de renderizado con
un `undefined`.

**Públicos**: `getTournament` · `getRules` · `getPlayers` · `getPlayer` ·
`getFixture` · `getRounds` · `getRound` · `getMatches` · `getMatch` ·
`getStandings` · `getStats` · `getSanctions`

**Administrativos** (exigen `cookie`): `getAdminPlayers` · `getAdminMatch` ·
`getAdminSanctions` · `getAuditLog` · `getCurrentAdmin`

`getMatch` devuelve la proyección pública; `getAdminMatch`, la completa con
reportes, notas y motivos de corrección.

## `messages.ts`

Traduce los códigos estables de la API a algo que una persona entienda:

```
PENDING_RULE  →  «Esta acción todavía no puede realizarse: la regla del torneo
                  que la define está pendiente de definición.»
```

El orden es: código conocido → estado HTTP conocido → mensaje del servidor. El
código técnico solo se enseña con `showTechnicalDetails()`, es decir, en
desarrollo.

## `session.ts`

La sesión vista desde el servidor de Astro.

| Función              | Qué hace                                                    |
| -------------------- | ----------------------------------------------------------- |
| `sessionHeader`      | La cabecera `cookie` que se reenvía a la API, o `undefined` |
| `currentSession`     | El administrador conectado, o `null` si 401/403             |
| `storeSession`       | Guarda la cookie en el origen del frontend                  |
| `clearSession`       | La borra                                                    |
| `tokenFromSetCookie` | Extrae el token del `set-cookie` que devolvió la API        |

`currentSession` distingue «no hay sesión» de «algo falló»: un 401 o un 403
devuelven `null` y la página redirige al acceso; cualquier otro error se propaga
y se muestra.

`tokenFromSetCookie` parte la cabecera solo por las comas que empiezan un par
`nombre=`. Una cookie con `Expires=Wed, 09 Jun 2027` lleva coma dentro, y un
`split(',')` la partiría por la mitad.

## Cómo se usa en una página

```astro
---
let standings: Standings | null = null;
let failure: FriendlyError | null = null;

try {
  standings = await getStandings();
} catch (error) {
  failure = friendlyError(error);
}
---

{
  failure !== null || standings === null ? (
    <ApiFailure failure={failure ?? friendlyError(new Error('sin datos'))} />
  ) : (
    <StandingsTable standings={standings} client:load />
  )
}
```

Una página **nunca** deja que un fallo de la API la tumbe: lo atrapa y muestra el
estado de error. Que la liga no se pueda consultar durante un minuto es molesto;
una pantalla en blanco sin explicación, peor.

## Desde el navegador

Los componentes de React no llaman a la API: llaman al propio origen.

```ts
const { run, busy, failure } = useAdminAction();
await run('matches/xyz/result', { body: { homeCrowns: 3, awayCrowns: 1 } });
// → POST /api/admin/matches/xyz/result → API con la sesión
```

Ver el BFF en [frontend-architecture.md](frontend-architecture.md).
