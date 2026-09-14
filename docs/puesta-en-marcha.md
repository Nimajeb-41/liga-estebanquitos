# Puesta en marcha

Lo que hay que hacer para que la liga eche a andar, en orden.

---

## Arrancar

Un solo comando, en **una ventana que se queda abierta**:

```bash
npm run online
```

Levanta las tres piezas en orden y espera a que cada una responda antes de
seguir: la API, el sitio y el túnel público. El orden importa —abrir el túnel
antes de que el sitio conteste publica una web rota, que desde fuera no se
distingue de un servidor mal hecho—.

**Mientras esa ventana siga abierta, la liga está en línea.** Al cerrarla, o con
Ctrl+C, se paran las tres juntas. Es deliberado: dejar procesos sueltos acaba en
dos servidores peleándose por la misma carpeta de base de datos, que PGlite abre
en exclusiva.

Si prefieres verlas por separado, cada una en su terminal:

```bash
npm run liga     # API y base de datos
npm run web      # el sitio ya construido
npm run tunel    # la URL pública
```

Y para desarrollar, con recarga en caliente:

```bash
npm run dev --workspace=@liga/web
```

La base de datos vive en `datos/liga`, una carpeta del proyecto. No hace falta
Docker ni ningún servicio aparte. Las migraciones se aplican solas al arrancar.

**Solo puede haber un servidor encendido a la vez**: PGlite abre esa carpeta en
exclusiva. Si `npm run liga` falla diciendo que no puede abrirla, es que ya hay
otro corriendo.

### Copia de seguridad

Los datos de la liga son esa carpeta. Copiarla **con el servidor parado** es una
copia de seguridad completa:

```bash
cp -r datos/liga datos/copia-2026-10-10
```

Hazlo antes de cada jornada. Es lo más barato que se puede hacer para no perder
una temporada.

---

## Antes de la primera jornada

### 1. Completar la plantilla

El calendario **no se puede generar** hasta que haya 10 participantes
confirmados. Con menos, la API responde `ROSTER_INCOMPLETE` y no es un error:
un todos-contra-todos de 10 necesita 10.

Se añaden en `/admin/players`.

### 2. Pasar el torneo a READY y generar el calendario

En `/admin` o `/admin/fixtures`. La semilla del sorteo se guarda: con ella el
mismo sorteo se puede reproducir y comprobar.

Generar el calendario deja el torneo en `SCHEDULED` y **cierra la plantilla**:
a partir de ahí no se añade ni se quita gente. Los nombres sí se pueden seguir
corrigiendo.

### 3. Programar las fechas

En `/admin/jornadas`, «Programar la temporada». Tres jornadas cada sábado es el
formato de esta liga: seis sesiones de quince partidos.

El formulario enseña cuánto dura cada sesión antes de enviar nada. Con quince
partidos cada media hora son siete horas y media; si es demasiado, baja el
intervalo o reparte en más sábados.

### 4. Empezar

Pasar el torneo a `LIVE` en `/admin`. A partir de ahí se registran resultados.

---

## Durante una jornada

1. **Marcar el partido en juego** (`/admin/matches/[id]`) cuando empiece. Eso es
   lo que hace que la web pueda anunciar el directo.
2. **Registrar el resultado** cuando termine.
3. Si alguien no aparece, pasados los 15 minutos de tolerancia se puede
   **declarar incomparecencia**: 3 puntos para quien se presentó y ninguna
   corona para nadie.

El **Centro de acción** en `/admin` enumera lo que queda sin resolver.

### El aviso de directo

Aparece solo cuando se cumplen **las dos** condiciones:

- El canal de Kick está emitiendo **Clash Royale**.
- Hay al menos un partido de la liga marcado en juego.

Si Kick no responde, no se anuncia nada. Es deliberado: ante la duda, la web no
afirma que hay directo.

---

## Clash Royale: qué esperar

Poner el tag de un participante **no hace que sus resultados aparezcan solos**.

El flujo es:

1. Un administrador lanza la sincronización en `/admin/clash-royale`.
2. Se lee el historial de batallas con la API oficial.
3. Las batallas que encajan con un partido se guardan como **candidatas**.
4. **Un administrador las confirma.** Solo entonces se registra el resultado.

Los pasos 1 y 4 son de una persona a propósito. El historial es **evidencia
observada**, no un acta: una partida amistosa entre dos participantes tiene
exactamente la misma forma que una de competición. Y vincular un tag no es
verificar que la cuenta sea de esa persona — **P-11** sigue abierta.

La liga se puede operar entera sin tocar esto: los resultados se registran a
mano y la integración solo propone.

### Si la sincronización falla con `invalidIp`

El token está atado a una IP concreta. Cuando la conexión cambia de IP, la API
responde `accessDenied.invalidIp`.

Se arregla añadiendo la IP actual a la clave en
[developer.clashroyale.com](https://developer.clashroyale.com). Consultar la IP
actual:

```bash
curl -s https://api.ipify.org
```

En una conexión doméstica la IP cambia sola, así que puede volver a pasar. No
rompe nada: ningún resultado depende de la integración.

---

## Variables de entorno

Todas en `.env`, que **no se versiona**. Las que importan:

| Variable                    | Para qué                                     |
| --------------------------- | -------------------------------------------- |
| `DATABASE_URL`              | `file:./datos/liga` (local) o `postgres://…` |
| `ADMIN_EMAIL`               | Quién administra                             |
| `ADMIN_PASSWORD`            | Su contraseña. Mínimo 12 caracteres          |
| `CLASH_ROYALE_API_TOKEN`    | El token del portal de Supercell             |
| `CLASH_ROYALE_ENABLED`      | `true` para activar la integración           |
| `CLASH_ROYALE_SYNC_ENABLED` | `false`: la sincronización se lanza a mano   |
| `BROADCAST_CHECK_ENABLED`   | `true` para comprobar el directo contra Kick |
| `BROADCAST_CHANNEL_SLUG`    | El canal: `esstebannpluss`                   |

El token **nunca sale del backend**: no se registra, no viaja en ninguna
respuesta y `/health` solo dice si está configurado.

---

## Antes de subir cambios

1. Comprobar que `.gitignore` cubre `.env`, `.env.backup-*`, `/datos/` y `/.tmp/`.
2. Ejecutar `npm run audit:secrets`. Va el primero dentro de `npm run verify` y
   existe porque el error ya ocurrió una vez: en la Fase 3 un token real acabó
   en `.env.example`. **Ese token debe darse por comprometido y no
   reutilizarse.**
3. Ejecutar `npm run verify` entero.
