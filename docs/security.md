# Seguridad

Este documento describe qué protege la plataforma, cómo, y qué **no** protege.
La última parte importa igual que la primera: una lista de medidas sin sus
límites se lee como una garantía, y aquí no hay ninguna.

---

## El incidente que da forma a este documento

Durante la Fase 3, un token real de la API de Clash Royale acabó escrito en
`.env.example` —la plantilla versionada— en lugar de en `.env`. Los dos archivos
se llaman casi igual y tienen exactamente las mismas claves.

**Se considera un incidente de seguridad ocurrido.** El token debe darse por
comprometido, rotarse, y no reutilizarse. Todo lo que sigue en la sección de
secretos existe porque ese error es fácil de cometer, invisible mientras nadie
mire, y definitivo en cuanto el repositorio se publique.

---

## Secretos

### Dónde viven

| Secreto                            | Dónde                               | Versionado |
| ---------------------------------- | ----------------------------------- | ---------- |
| `CLASH_ROYALE_API_TOKEN`           | `.env` local / entorno del servidor | **No**     |
| `ADMIN_PASSWORD` (siembra inicial) | `.env` local                        | **No**     |
| `DATABASE_URL` (con credenciales)  | entorno del servidor                | **No**     |
| Cookie de sesión administrativa    | navegador, `httpOnly`               | —          |

`.env` está en `.gitignore`, y hay un test que lo comprueba. `.env.example` es la
plantilla: **todas** sus claves secretas van vacías, y hay un test por cada una.

### Qué garantiza el código

- El token **nunca sale del backend**. El navegador habla con Astro, Astro habla
  con la API, y solo la API habla con Supercell.
- No se registra, no se serializa en ninguna respuesta y no aparece en
  `/health`, que solo dice `enabled` o `disabled`.
- El cliente de Clash Royale no lo mete en los mensajes de error, y el traductor
  de errores de la API tampoco lo añade.
- El registro de Fastify redacta `req.headers.cookie` y
  `req.headers.authorization`.

### Cómo se comprueba

Tres capas, y ninguna sustituye a las otras:

1. **`npm run audit:secrets`** — recorre los archivos versionables buscando
   formas de secreto (JWT, `Bearer`, claves privadas, contraseñas literales) y
   comprueba estructuralmente `.env.example` y `.gitignore`. **Nunca imprime el
   valor que encuentra**: dice archivo, línea y tipo. Está dentro de
   `npm run verify`, antes que nada.

2. **`apps/api/test/secrets.test.ts`** — dos bloques. Uno lee las plantillas y
   la documentación versionada. El otro levanta la API **con un token de prueba
   configurado** y barre todas las rutas públicas y administrativas, los errores
   de validación, los 401, los 404 y el fallo de la integración externa,
   comprobando que el token no aparece en ninguna respuesta.

3. **`npm run e2e`** — revisa los paquetes JavaScript que se descarga el
   navegador (`apps/web/dist/client`) buscando la variable del token, cabeceras
   `Authorization` y cualquier cadena con forma de JWT. Es la superficie que los
   tests de la API no ven: un `import.meta.env.CLASH_ROYALE_API_TOKEN` en un
   componente de cliente se resolvería al compilar y quedaría escrito en un
   `.js` público para siempre.

### Qué no garantiza

- No protege contra un token pegado en un mensaje de chat, en una captura de
  pantalla o en un ticket. Eso es procedimiento, no código.
- El escáner busca **formas conocidas**. Un secreto con una forma nueva pasa.
- Nada de esto rota el token: eso se hace en el portal de Supercell.

---

## El token está atado a una IP

La API oficial exige declarar las IP desde las que se usará el token. Durante el
desarrollo de la Fase 3 la IP doméstica cambió de `.101` a `.208` en unas horas y
el token dejó de valer: la API respondió `403 accessDenied.invalidIp`.

Consecuencias que ya están asumidas en el diseño:

- **La configuración usa exactamente el formato del portal oficial.** No se
  amplía la lista con rangos CIDR por nuestra cuenta: ampliar el alcance de una
  credencial para no tener que actualizarla es cambiar seguridad por comodidad.
- La demostración (`npm run demo`) no depende de la API: usa fixtures. Una demo
  que se rompe porque cambió una IP no sirve para nada.
- Un `403` en el panel se muestra con su motivo, porque casi siempre **es la
  IP** y saberlo ahorra media hora.

---

## Sesiones administrativas

- La cookie es `httpOnly`, `SameSite=Lax`, y `Secure` en producción.
- En la base de datos se guarda el **hash SHA-256** del token de sesión, nunca el
  token. Si la tabla se filtrase, no serviría para suplantar a nadie.
- La sesión caduca (`SESSION_TTL_HOURS`, 12 por defecto).
- Los roles de solo lectura no pasan el guardia de escritura.

El puente `/api/admin/...` del frontend **no es un proxy abierto**: exige sesión,
comprueba el origen y no deja salirse del prefijo `/admin`. Hay tres
comprobaciones de extremo a extremo que lo fijan.

---

## Qué es público y qué no

La ficha administrativa de un partido y la pública salen de la **misma** función:
la pública se construye quitando campos, no añadiéndolos. Así no puede existir un
campo nuevo que aparezca en público por olvido.

Nunca salen al público:

- las notas internas de un aplazamiento (suelen hablar de circunstancias
  personales de alguien);
- quién reportó qué y con qué evidencia —solo el recuento de reportes—;
- el motivo de una corrección (es la regla **P-10**, sin decidir: publicarlo
  ahora sería cerrarla por la puerta de atrás);
- las URL de evidencia;
- los datos crudos de Clash Royale;
- el tag de Clash Royale de quien **no** juega la liga. El de un participante sí,
  porque lo declaró al inscribirse; el de un rival cualquiera se enmascara antes
  de salir del servidor (`maskClashTag`).

---

## Validación de entrada

Todo lo que llega del cliente pasa por un esquema de Zod antes de tocar nada
(`apps/api/src/schemas.ts`). A partir de ese punto el resto del código trabaja
con datos comprobados, y las reglas de competición las valida después el dominio.

Dos casos que merecen mención:

- **Enlaces de transmisión**: solo `http` y `https`. `z.url()` por sí solo acepta
  cualquier esquema, y un `javascript:` acabaría pegado en un `href` de la ficha
  pública.
- **Filtros de auditoría**: un filtro con forma inválida se rechaza con un 400 en
  vez de ignorarse. Ignorarlo devolvería un resultado que no es el que se pidió,
  y quien lo lea creerá que es la respuesta a su pregunta.

---

## Cabeceras y superficie HTTP

`@fastify/helmet` con una CSP explícita: `script-src 'none'` en el panel servido
por la API, `frame-ancestors 'none'`, `form-action 'self'`.

CORS cerrado por defecto (solo mismo origen); `CORS_ORIGINS` no puede ser `*` en
producción y la configuración se niega a arrancar si lo es.

Límite de peticiones global de 300 por minuto.

---

## Lo que la plataforma no verifica

**La propiedad de una cuenta de Clash Royale.** Vincular no es verificar.
Comprobarlo exigiría el endpoint `verifytoken`, que Supercell no documenta. La
vinculación nace `UNVERIFIED` y se queda ahí; la interfaz lo dice con esas
palabras en la ficha de cada participante. Un participante podría declarar la
etiqueta de otro y el sistema no lo detectaría: eso es **P-11**, y sigue abierta.

Ver [ADR 0015](adr/0015-vincular-no-es-verificar.md).

---

## Qué hacer si un secreto se filtra

1. **Rotar primero.** Revocar el token en el portal de Supercell y crear uno
   nuevo. Borrarlo del repositorio no lo desfiltra.
2. Comprobar que el nuevo va a `.env` y no a `.env.example`.
3. `npm run audit:secrets` para confirmar que no queda rastro en lo versionado.
4. Si llegó a publicarse en un repositorio remoto, asumir que está indexado:
   reescribir el historial ayuda, pero no borra las copias.
