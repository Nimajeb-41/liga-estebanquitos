/**
 * Panel de administracion.
 *
 * Paginas servidas por el propio backend y formularios HTML normales
 * (POST + redireccion). Llaman exactamente a los mismos servicios que la API
 * REST, asi que no hay dos caminos con reglas distintas.
 *
 * Proteccion CSRF: la cookie de sesion es SameSite=Lax, lo que impide que un
 * formulario alojado en otro sitio envie la sesion en un POST.
 */

import { DomainError, EMPTY_SLOT_LABEL, POSTPONED_BADGE } from '@liga/domain';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { currentAdmin, requireAdmin } from '../auth/guard.ts';
import { verifyPassword } from '../auth/passwords.ts';
import { createSession, revokeSession, SESSION_COOKIE } from '../auth/sessions.ts';
import { listAudit } from '../data/audit.ts';
import type { AppContext } from '../data/context.ts';
import { listMatches } from '../data/matches.ts';
import { requireTournament } from '../data/tournament.ts';
import { HttpError } from '../errors.ts';
import { generateOfficialFixture, getFixture } from '../services/fixture.ts';
import {
  correctResult,
  getAdminMatchDetail,
  postpone,
  recordResult,
  reportResult,
  reschedule,
  setMatchLive,
} from '../services/matches.ts';
import {
  confirmPlayer,
  createPlayer,
  deletePlayer,
  replacePlayer,
  unconfirmPlayer,
  withdrawPlayer,
} from '../services/players.ts';
import {
  createNewSanction,
  listAllSanctions,
  revokeExistingSanction,
} from '../services/sanctions.ts';
import { getStandings } from '../services/standings.ts';
import { changeTournamentStatus, getTournamentOverview } from '../services/tournament.ts';
import { ADMIN_CSS, escapeHtml, formatDate, layout, statusBadge } from './render.ts';
import { schema } from '@liga/database';
import { eq } from 'drizzle-orm';

interface Flash {
  ok?: string | undefined;
  err?: string | undefined;
}

function flashOf(request: FastifyRequest): Flash {
  const query = request.query as Record<string, string | undefined>;
  return { ok: query['ok'], err: query['err'] };
}

function messageOf(error: unknown): string {
  if (error instanceof DomainError || error instanceof HttpError) return error.message;
  if (error instanceof Error && error.message.length > 0) return error.message;
  return 'Error inesperado.';
}

/** Ejecuta una accion de formulario y vuelve a la pagina con el resultado. */
async function run(
  reply: FastifyReply,
  backTo: string,
  fn: () => Promise<string>,
): Promise<FastifyReply> {
  try {
    const message = await fn();
    return reply.redirect(`${backTo}?ok=${encodeURIComponent(message)}`);
  } catch (error) {
    return reply.redirect(`${backTo}?err=${encodeURIComponent(messageOf(error))}`);
  }
}

function body<T extends Record<string, unknown>>(request: FastifyRequest): T {
  return (request.body ?? {}) as T;
}

function optionalText(value: unknown): string | null {
  const text = typeof value === 'string' ? value.trim() : '';
  return text.length === 0 ? null : text;
}

export async function registerAdminUi(app: FastifyInstance, ctx: AppContext): Promise<void> {
  app.get('/admin/style.css', async (_request, reply) => {
    reply.header('content-type', 'text/css; charset=utf-8');
    reply.header('cache-control', 'public, max-age=300');
    return ADMIN_CSS;
  });

  /* ------------------------------- Sesion -------------------------------- */

  app.get('/admin/login', async (request, reply) => {
    reply.type('text/html; charset=utf-8');
    return layout({
      title: 'Entrar',
      flash: flashOf(request),
      body: `<section class="panel login">
        <h1>Panel de administracion</h1>
        <p class="lead">Liga Estabanquitos 2026-1</p>
        <form method="post" action="/admin/login" class="stack">
          <label>Correo<input type="email" name="email" required autocomplete="username"></label>
          <label>Contrasena<input type="password" name="password" required autocomplete="current-password"></label>
          <button type="submit" class="primary">Entrar</button>
        </form>
      </section>`,
    });
  });

  app.post(
    '/admin/login',
    { config: { rateLimit: { max: 10, timeWindow: '5 minutes' } } },
    async (request, reply) => {
      const form = body<{ email?: string; password?: string }>(request);
      const email = (form.email ?? '').trim().toLowerCase();
      const password = form.password ?? '';

      const admin = await ctx.db.query.adminUsers.findFirst({
        where: eq(schema.adminUsers.email, email),
      });
      const digest = admin?.passwordHash ?? '$argon2id$v=19$m=19456,t=2,p=1$aaaaaaaaaaaaaaaa$aaaa';
      const valid = await verifyPassword(digest, password);

      if (admin === undefined || !admin.isActive || !valid) {
        return reply.redirect(
          `/admin/login?err=${encodeURIComponent('Correo o contrasena incorrectos.')}`,
        );
      }

      const session = await createSession(
        ctx.db,
        admin.id,
        ctx.config.session.ttlHours,
        ctx.now(),
        request.headers['user-agent'] ?? null,
      );
      reply.setCookie(SESSION_COOKIE, session.token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: ctx.config.session.secureCookie,
        path: '/',
        expires: session.expiresAt,
      });
      return reply.redirect('/admin');
    },
  );

  app.post('/admin/logout', async (request, reply) => {
    const token = request.cookies[SESSION_COOKIE];
    if (token !== undefined) await revokeSession(ctx.db, token, ctx.now());
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return reply.redirect('/admin/login');
  });

  /* ------------------------- Paginas autenticadas ------------------------ */

  await app.register(async (panel) => {
    panel.addHook('preHandler', async (request, reply) => {
      try {
        await requireAdmin(ctx)(request, reply);
      } catch {
        return reply.redirect('/admin/login');
      }
      return undefined;
    });

    panel.get('/admin', async (request, reply) => {
      const admin = currentAdmin(request);
      const overview = await getTournamentOverview(ctx);
      const { tournament } = await requireTournament(ctx.db, ctx.config.tournamentSlug);
      const matches = await listMatches(ctx.db, tournament.id);
      const sanctions = await listAllSanctions(ctx);

      const count = (status: string): number =>
        matches.filter((row) => row.match.status === status).length;

      const upcoming = matches
        .filter((row) => row.match.status === 'SCHEDULED' || row.match.status === 'LIVE')
        .slice(0, 8);
      const postponed = matches.filter((row) => row.match.status === 'POSTPONED');
      const disputed = matches.filter((row) => row.match.status === 'DISPUTED');

      // READY no avanza con un boton de estado: el paso a SCHEDULED lo produce
      // generar el calendario oficial, no un cambio de estado suelto.
      const nextStatus: Record<string, string> = {
        DRAFT: 'REGISTRATION',
        REGISTRATION: 'READY',
        SCHEDULED: 'LIVE',
        LIVE: 'FINISHED',
      };
      const advance = nextStatus[tournament.status];

      const matchRows = (rows: typeof matches): string =>
        rows.length === 0
          ? '<p class="muted small">Nada por aqui.</p>'
          : `<div class="scroll"><table><thead><tr><th>Fecha</th><th>Partido</th><th>Estado</th><th>Programado</th><th></th></tr></thead><tbody>${rows
              .map(
                (row) => `<tr>
                  <td>${row.round.number}</td>
                  <td>${escapeHtml(row.homePlayer.displayName)} <span class="muted">vs</span> ${escapeHtml(row.awayPlayer.displayName)}</td>
                  <td>${statusBadge(row.match.status)}</td>
                  <td class="small">${formatDate(row.match.scheduledAt)}</td>
                  <td class="right"><a href="/admin/matches/${row.match.id}">Abrir</a></td>
                </tr>`,
              )
              .join('')}</tbody></table></div>`;

      reply.type('text/html; charset=utf-8');
      return layout({
        title: 'Panel',
        active: '/admin',
        adminName: admin.displayName,
        flash: flashOf(request),
        body: `
        <h1>${escapeHtml(overview.name)}</h1>
        <p class="lead">Temporada ${escapeHtml(overview.season)} · reglamento ${escapeHtml(overview.rulesVersion)}</p>

        <section class="panel">
          <div class="grid">
            <div class="stat"><div class="label">Estado</div><div class="value">${statusBadge(overview.status)}</div></div>
            <div class="stat"><div class="label">Confirmados</div><div class="value">${overview.roster.confirmed} / ${overview.roster.rosterSize}</div></div>
            <div class="stat"><div class="label">Partidos</div><div class="value">${overview.fixture.matches}</div></div>
            <div class="stat"><div class="label">Jugados</div><div class="value">${count('COMPLETED')}</div></div>
            <div class="stat"><div class="label">En directo</div><div class="value">${count('LIVE')}</div></div>
            <div class="stat"><div class="label">Pospuestos</div><div class="value">${count('POSTPONED')}</div></div>
            <div class="stat"><div class="label">En disputa</div><div class="value">${count('DISPUTED')}</div></div>
            <div class="stat"><div class="label">Sanciones activas</div><div class="value">${sanctions.filter((row) => row.status === 'ACTIVE').length}</div></div>
          </div>
        </section>

        ${
          tournament.status === 'READY'
            ? `<section class="panel">
                <h2>Siguiente paso</h2>
                <p class="muted small">La plantilla esta cerrada. El torneo pasa a SCHEDULED al generar el calendario oficial.</p>
                <p><a href="/admin/fixture">Generar calendario oficial</a></p>
              </section>`
            : ''
        }

        ${
          advance === undefined
            ? ''
            : `<section class="panel">
                <h2>Avanzar el torneo</h2>
                <p class="muted small">Estado actual: ${escapeHtml(tournament.status)}. Siguiente paso: ${escapeHtml(advance)}.</p>
                <form method="post" action="/admin/tournament/status" class="row">
                  <input type="hidden" name="status" value="${escapeHtml(advance)}">
                  <button type="submit" class="primary">Pasar a ${escapeHtml(advance)}</button>
                </form>
              </section>`
        }

        <section class="panel">
          <h2>Proximos partidos</h2>
          ${matchRows(upcoming)}
        </section>

        <section class="panel">
          <h2>Pospuestos</h2>
          ${matchRows(postponed)}
        </section>

        <section class="panel">
          <h2>En disputa</h2>
          ${matchRows(disputed)}
        </section>`,
      });
    });

    panel.post('/admin/tournament/status', async (request, reply) => {
      const form = body<{ status?: string }>(request);
      return run(reply, '/admin', async () => {
        const result = await changeTournamentStatus(
          ctx,
          currentAdmin(request),
          form.status as Parameters<typeof changeTournamentStatus>[2],
        );
        return `Torneo en ${result.to}.`;
      });
    });

    /* ---------------------------- Participantes --------------------------- */

    panel.get('/admin/players', async (request, reply) => {
      const admin = currentAdmin(request);
      const { tournament, settings } = await requireTournament(ctx.db, ctx.config.tournamentSlug);
      const { listPlayers } = await import('../services/players.ts');
      const data = await listPlayers(ctx);
      const editable = ['DRAFT', 'REGISTRATION', 'READY'].includes(tournament.status);

      const slots = data.slots
        .map(
          (slot) =>
            `<tr><td class="num">${slot.slot}</td><td>${
              slot.player === null
                ? `<span class="badge tbd">${escapeHtml(EMPTY_SLOT_LABEL)}</span>`
                : escapeHtml(slot.player.displayName)
            }</td></tr>`,
        )
        .join('');

      const rows = data.players
        .map(
          (player) => `<tr>
            <td>${escapeHtml(player.displayName)}${player.clashTag === null ? '' : ` <code>${escapeHtml(player.clashTag)}</code>`}</td>
            <td>${statusBadge(player.status)}</td>
            <td class="num">${player.slot ?? '<span class="muted">-</span>'}</td>
            <td class="right small">
              ${
                editable
                  ? `${
                      player.status === 'CONFIRMED'
                        ? `<form method="post" action="/admin/players/${player.id}/unconfirm" class="inline"><button type="submit">Desconfirmar</button></form>`
                        : player.status === 'REGISTERED'
                          ? `<form method="post" action="/admin/players/${player.id}/confirm" class="inline"><button type="submit" class="primary">Confirmar</button></form>`
                          : ''
                    }
                    <form method="post" action="/admin/players/${player.id}/withdraw" class="inline"><button type="submit">Retirar</button></form>
                    <form method="post" action="/admin/players/${player.id}/delete" class="inline"><button type="submit" class="danger">Eliminar</button></form>`
                  : '<span class="muted">plantilla bloqueada</span>'
              }
            </td>
          </tr>`,
        )
        .join('');

      reply.type('text/html; charset=utf-8');
      return layout({
        title: 'Participantes',
        active: '/admin/players',
        adminName: admin.displayName,
        flash: flashOf(request),
        body: `
        <h1>Participantes</h1>
        <p class="lead">${data.summary.confirmed} / ${data.summary.rosterSize} confirmados · ${data.summary.pending} plazas por confirmar</p>

        <section class="panel">
          <h2>Plazas</h2>
          <div class="scroll"><table><thead><tr><th class="num">Plaza</th><th>Jugador</th></tr></thead><tbody>${slots}</tbody></table></div>
        </section>

        <section class="panel">
          <h2>Plantilla</h2>
          <div class="scroll"><table><thead><tr><th>Jugador</th><th>Estado</th><th class="num">Plaza</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
        </section>

        ${
          editable
            ? `<section class="panel">
                <h2>Anadir participante</h2>
                <form method="post" action="/admin/players" class="stack">
                  <label>Nombre<input name="displayName" required maxlength="40"></label>
                  <label>Tag de Clash Royale (opcional)<input name="clashTag" maxlength="20" placeholder="#2P0LYQ0"></label>
                  <label>Notas (opcional)<input name="notes" maxlength="500"></label>
                  <button type="submit" class="primary">Anadir</button>
                </form>
              </section>
              <section class="panel">
                <h2>Sustituir participante</h2>
                <p class="muted small">El saliente queda como REPLACED y el entrante hereda su plaza. Si el calendario ya existe, tambien hereda sus partidos.</p>
                <form method="post" action="/admin/players/replace" class="stack">
                  <label>Sale<select name="outgoingId" required>${data.players
                    .filter(
                      (player) => player.status === 'CONFIRMED' || player.status === 'REGISTERED',
                    )
                    .map(
                      (player) =>
                        `<option value="${player.id}">${escapeHtml(player.displayName)}</option>`,
                    )
                    .join('')}</select></label>
                  <label>Entra<input name="displayName" required maxlength="40"></label>
                  <label>Tag (opcional)<input name="clashTag" maxlength="20"></label>
                  <button type="submit">Sustituir</button>
                </form>
              </section>`
            : `<section class="panel"><p class="muted">La plantilla esta bloqueada porque el torneo esta en ${escapeHtml(tournament.status)}. Solo se admite la sustitucion de participantes, desde la API o volviendo a ${escapeHtml(settings.rosterSize === 0 ? '' : 'READY')}.</p></section>`
        }`,
      });
    });

    panel.post('/admin/players', async (request, reply) => {
      const form = body<{ displayName?: string; clashTag?: string; notes?: string }>(request);
      return run(reply, '/admin/players', async () => {
        await createPlayer(ctx, currentAdmin(request), {
          displayName: (form.displayName ?? '').trim(),
          clashTag: optionalText(form.clashTag),
          notes: optionalText(form.notes),
        });
        return `Participante ${form.displayName ?? ''} anadido.`;
      });
    });

    panel.post('/admin/players/:id/confirm', async (request, reply) => {
      const { id } = request.params as { id: string };
      return run(reply, '/admin/players', async () => {
        await confirmPlayer(ctx, currentAdmin(request), id);
        return 'Participante confirmado.';
      });
    });

    panel.post('/admin/players/:id/unconfirm', async (request, reply) => {
      const { id } = request.params as { id: string };
      return run(reply, '/admin/players', async () => {
        await unconfirmPlayer(ctx, currentAdmin(request), id);
        return 'Participante desconfirmado; su plaza queda libre.';
      });
    });

    panel.post('/admin/players/:id/withdraw', async (request, reply) => {
      const { id } = request.params as { id: string };
      return run(reply, '/admin/players', async () => {
        await withdrawPlayer(ctx, currentAdmin(request), id);
        return 'Participante retirado.';
      });
    });

    panel.post('/admin/players/:id/delete', async (request, reply) => {
      const { id } = request.params as { id: string };
      return run(reply, '/admin/players', async () => {
        await deletePlayer(ctx, currentAdmin(request), id);
        return 'Participante eliminado.';
      });
    });

    panel.post('/admin/players/replace', async (request, reply) => {
      const form = body<{ outgoingId?: string; displayName?: string; clashTag?: string }>(request);
      return run(reply, '/admin/players', async () => {
        const result = await replacePlayer(ctx, currentAdmin(request), form.outgoingId ?? '', {
          displayName: (form.displayName ?? '').trim(),
          clashTag: optionalText(form.clashTag),
        });
        return `Sustitucion aplicada (${result.movedMatches} partidos trasladados).`;
      });
    });

    /* ------------------------------- Fixture ------------------------------ */

    panel.get('/admin/fixture', async (request, reply) => {
      const admin = currentAdmin(request);
      const fixture = await getFixture(ctx);
      const overview = await getTournamentOverview(ctx);

      const rounds = fixture.rounds
        .map(
          (round) => `<section class="panel">
            <h2>Fecha ${round.number} <span class="muted small">(${round.leg === 1 ? 'ida' : 'vuelta'})</span></h2>
            <div class="scroll"><table><thead><tr><th>Partido</th><th>Estado</th><th>Fecha</th><th></th></tr></thead><tbody>
            ${round.matches
              .map(
                (match) => `<tr>
                  <td>${escapeHtml(match.home.displayName)} <span class="muted">vs</span> ${escapeHtml(match.away.displayName)}
                    ${match.result === null ? '' : `<strong>${match.result.homeCrowns} - ${match.result.awayCrowns}</strong>`}</td>
                  <td>${statusBadge(match.status)}${
                    match.status === 'POSTPONED'
                      ? ` <span class="badge postponed">${escapeHtml(POSTPONED_BADGE)}</span>`
                      : ''
                  }</td>
                  <td class="small">${formatDate(match.scheduledAt)}${
                    match.postponementCount > 0
                      ? `<br><span class="muted">original: ${formatDate(match.originalScheduledAt)}</span>`
                      : ''
                  }</td>
                  <td class="right"><a href="/admin/matches/${match.id}">Abrir</a></td>
                </tr>`,
              )
              .join('')}
            </tbody></table></div>
          </section>`,
        )
        .join('');

      reply.type('text/html; charset=utf-8');
      return layout({
        title: 'Calendario',
        active: '/admin/fixture',
        adminName: admin.displayName,
        flash: flashOf(request),
        body: `
        <h1>Calendario oficial</h1>
        <p class="lead">${
          fixture.generated
            ? `${fixture.rounds.length} jornadas · semilla <code>${escapeHtml(fixture.seed ?? '')}</code>`
            : 'Todavia no se ha generado.'
        }</p>
        ${
          fixture.generated
            ? ''
            : `<section class="panel">
                <h2>Generar</h2>
                <p class="muted small">Requiere ${overview.roster.rosterSize} confirmados (hay ${overview.roster.confirmed}) y el torneo en READY (esta en ${escapeHtml(overview.status)}).</p>
                <form method="post" action="/admin/fixture/generate" class="stack">
                  <label>Semilla (opcional, para reproducir el sorteo)<input name="seed" maxlength="120"></label>
                  <button type="submit" class="primary">Generar calendario oficial</button>
                </form>
              </section>`
        }
        ${rounds}`,
      });
    });

    panel.post('/admin/fixture/generate', async (request, reply) => {
      const form = body<{ seed?: string }>(request);
      return run(reply, '/admin/fixture', async () => {
        const seed = optionalText(form.seed);
        const result = await generateOfficialFixture(
          ctx,
          currentAdmin(request),
          seed === null ? {} : { seed },
        );
        return `Calendario generado: ${result.rounds} jornadas y ${result.matches} partidos (semilla ${result.seed}).`;
      });
    });

    /* ------------------------------- Partido ------------------------------ */

    panel.get('/admin/matches/:id', async (request, reply) => {
      const admin = currentAdmin(request);
      const { id } = request.params as { id: string };
      const match = await getAdminMatchDetail(ctx, id);

      const history = [
        ...match.history.postponements.map(
          (entry) =>
            `<li><strong>${escapeHtml(entry.event)}</strong> · ${formatDate(entry.occurredAt)}<br>
             <span class="small muted">Jornada ${entry.roundNumber} · ${escapeHtml(entry.reason)} · ${escapeHtml(entry.notes)}</span><br>
             <span class="small">${formatDate(entry.previousScheduledAt)} &rarr; ${formatDate(entry.newScheduledAt)}</span></li>`,
        ),
        ...match.history.revisions.map(
          (entry) =>
            `<li><strong>Revision ${entry.revision}</strong> · ${formatDate(entry.changedAt)}<br>
             <span class="small">${escapeHtml(JSON.stringify(entry.previousValue))} &rarr; ${escapeHtml(JSON.stringify(entry.newValue))}</span><br>
             <span class="small muted">${escapeHtml(entry.reason)}</span></li>`,
        ),
      ].join('');

      const reports = match.history.reports
        .map(
          (report) =>
            `<li><span class="small">${escapeHtml(report.playerId === match.home.id ? match.home.displayName : match.away.displayName)}: <strong>${report.homeCrowns} - ${report.awayCrowns}</strong> · ${formatDate(report.reportedAt)}</span></li>`,
        )
        .join('');

      const back = `/admin/matches/${id}`;

      reply.type('text/html; charset=utf-8');
      return layout({
        title: 'Partido',
        active: '/admin/fixture',
        adminName: admin.displayName,
        flash: flashOf(request),
        body: `
        <h1>${escapeHtml(match.home.displayName)} vs ${escapeHtml(match.away.displayName)}</h1>
        <p class="lead">Fecha ${match.roundNumber} (${match.leg === 1 ? 'ida' : 'vuelta'}) · ${statusBadge(match.status)}
          ${match.postponementCount > 0 ? `· aplazado ${match.postponementCount} vez(ces)` : ''}</p>

        <section class="panel">
          <div class="grid">
            <div class="stat"><div class="label">Programado</div><div class="small">${formatDate(match.scheduledAt)}</div></div>
            <div class="stat"><div class="label">Fecha original</div><div class="small">${formatDate(match.originalScheduledAt)}</div></div>
            <div class="stat"><div class="label">Resultado</div><div class="value">${
              match.result === null
                ? '<span class="muted small">sin registrar</span>'
                : `${match.result.homeCrowns} - ${match.result.awayCrowns}`
            }</div></div>
            <div class="stat"><div class="label">Version</div><div class="value">${match.result?.version ?? 0}</div></div>
          </div>
        </section>

        <section class="panel">
          <h2>Estado</h2>
          <form method="post" action="${back}/live" class="row">
            <label>URL de transmision (opcional)<input name="streamUrl" type="url"></label>
            <button type="submit">Marcar en directo</button>
          </form>
        </section>

        <section class="panel">
          <h2>Aplazar</h2>
          <p class="muted small">Un aplazamiento no puntua, no suma coronas y no cuenta como jugado. La jornada original se conserva.</p>
          <form method="post" action="${back}/postpone" class="stack">
            <label>Motivo<select name="reason">
              <option value="PERSONAL">Problema personal</option>
              <option value="TECHNICAL">Problema tecnico</option>
              <option value="CONNECTION">Problema de conexion</option>
              <option value="SCHEDULE">Inconveniente de horario</option>
              <option value="UNAVAILABLE">Indisponibilidad justificada</option>
              <option value="ADMIN_DECISION">Decision administrativa</option>
              <option value="OTHER">Otro</option>
            </select></label>
            <label>Explicacion<textarea name="notes" rows="2" required minlength="3" maxlength="500"></textarea></label>
            <label>Nueva fecha propuesta (opcional)<input name="proposedAt" type="datetime-local"></label>
            <button type="submit">Posponer</button>
          </form>
        </section>

        <section class="panel">
          <h2>Reprogramar</h2>
          <form method="post" action="${back}/reschedule" class="stack">
            <label>Nueva fecha<input name="newScheduledAt" type="datetime-local" required></label>
            <label>Explicacion<textarea name="notes" rows="2" required minlength="3" maxlength="500"></textarea></label>
            <button type="submit" class="primary">Reprogramar</button>
          </form>
        </section>

        <section class="panel">
          <h2>Resultado</h2>
          <form method="post" action="${back}/result" class="row">
            <label>Coronas ${escapeHtml(match.home.displayName)}<input name="homeCrowns" type="number" min="0" max="3" required></label>
            <label>Coronas ${escapeHtml(match.away.displayName)}<input name="awayCrowns" type="number" min="0" max="3" required></label>
            <button type="submit" class="primary">Registrar</button>
          </form>
        </section>

        <section class="panel">
          <h2>Reporte de un jugador</h2>
          <p class="muted small">Ambos reportan en el orden local-visitante. Si coinciden, el resultado queda validado; si no, el partido pasa a DISPUTED.</p>
          <form method="post" action="${back}/report" class="row">
            <label>Jugador<select name="playerId">
              <option value="${match.home.id}">${escapeHtml(match.home.displayName)}</option>
              <option value="${match.away.id}">${escapeHtml(match.away.displayName)}</option>
            </select></label>
            <label>Local<input name="homeCrowns" type="number" min="0" max="3" required></label>
            <label>Visitante<input name="awayCrowns" type="number" min="0" max="3" required></label>
            <button type="submit">Registrar reporte</button>
          </form>
          <ul class="history small">${reports}</ul>
        </section>

        ${
          match.result === null
            ? ''
            : `<section class="panel">
                <h2>Corregir resultado</h2>
                <p class="muted small">El valor anterior se conserva como revision y queda auditado.</p>
                <form method="post" action="${back}/correct" class="stack">
                  <label>Coronas local<input name="homeCrowns" type="number" min="0" max="3" required></label>
                  <label>Coronas visitante<input name="awayCrowns" type="number" min="0" max="3" required></label>
                  <label>Motivo<textarea name="reason" rows="2" required minlength="3" maxlength="500"></textarea></label>
                  <button type="submit" class="danger">Corregir</button>
                </form>
              </section>`
        }

        <section class="panel">
          <h2>Historial</h2>
          <ul class="history">${history.length === 0 ? '<li class="muted small">Sin cambios registrados.</li>' : history}</ul>
        </section>`,
      });
    });

    panel.post('/admin/matches/:id/live', async (request, reply) => {
      const { id } = request.params as { id: string };
      const form = body<{ streamUrl?: string }>(request);
      return run(reply, `/admin/matches/${id}`, async () => {
        await setMatchLive(ctx, currentAdmin(request), id, optionalText(form.streamUrl));
        return 'Partido en directo.';
      });
    });

    panel.post('/admin/matches/:id/postpone', async (request, reply) => {
      const { id } = request.params as { id: string };
      const form = body<{ reason?: string; notes?: string; proposedAt?: string }>(request);
      return run(reply, `/admin/matches/${id}`, async () => {
        const proposed = optionalText(form.proposedAt);
        await postpone(ctx, currentAdmin(request), id, {
          reason: (form.reason ?? 'OTHER') as Parameters<typeof postpone>[3]['reason'],
          notes: form.notes ?? '',
          ...(proposed === null ? {} : { proposedAt: new Date(proposed).toISOString() }),
        });
        return 'Partido pospuesto; conserva su jornada original.';
      });
    });

    panel.post('/admin/matches/:id/reschedule', async (request, reply) => {
      const { id } = request.params as { id: string };
      const form = body<{ newScheduledAt?: string; notes?: string }>(request);
      return run(reply, `/admin/matches/${id}`, async () => {
        await reschedule(ctx, currentAdmin(request), id, {
          newScheduledAt: new Date(form.newScheduledAt ?? '').toISOString(),
          notes: form.notes ?? '',
        });
        return 'Partido reprogramado.';
      });
    });

    panel.post('/admin/matches/:id/result', async (request, reply) => {
      const { id } = request.params as { id: string };
      const form = body<{ homeCrowns?: string; awayCrowns?: string }>(request);
      return run(reply, `/admin/matches/${id}`, async () => {
        await recordResult(ctx, currentAdmin(request), id, {
          homeCrowns: Number(form.homeCrowns),
          awayCrowns: Number(form.awayCrowns),
        });
        return 'Resultado registrado.';
      });
    });

    panel.post('/admin/matches/:id/correct', async (request, reply) => {
      const { id } = request.params as { id: string };
      const form = body<{ homeCrowns?: string; awayCrowns?: string; reason?: string }>(request);
      return run(reply, `/admin/matches/${id}`, async () => {
        const result = await correctResult(ctx, currentAdmin(request), id, {
          homeCrowns: Number(form.homeCrowns),
          awayCrowns: Number(form.awayCrowns),
          reason: form.reason ?? '',
        });
        return `Resultado corregido (revision ${result.revision}).`;
      });
    });

    panel.post('/admin/matches/:id/report', async (request, reply) => {
      const { id } = request.params as { id: string };
      const form = body<{ playerId?: string; homeCrowns?: string; awayCrowns?: string }>(request);
      return run(reply, `/admin/matches/${id}`, async () => {
        const reconciliation = await reportResult(ctx, currentAdmin(request), id, {
          playerId: form.playerId ?? '',
          homeCrowns: Number(form.homeCrowns),
          awayCrowns: Number(form.awayCrowns),
        });
        return reconciliation.status === 'AGREED'
          ? 'Los dos reportes coinciden: resultado validado.'
          : reconciliation.status === 'CONFLICT'
            ? 'Los reportes se contradicen: el partido pasa a DISPUTED.'
            : 'Reporte registrado; falta el del rival.';
      });
    });

    /* ----------------------------- Clasificacion -------------------------- */

    panel.get('/admin/standings', async (request, reply) => {
      const admin = currentAdmin(request);
      const standings = await getStandings(ctx);

      const rows = standings.rows
        .map(
          (row) => `<tr>
            <td class="num">${row.position}${row.unresolvedTie ? ' <span class="badge disputed">empate</span>' : ''}</td>
            <td>${escapeHtml(row.displayName)}</td>
            <td class="num">${row.played}</td>
            <td class="num">${row.wins}</td>
            <td class="num">${row.losses}</td>
            <td class="num">${row.maxCrownWins}</td>
            <td class="num">${row.crownsFor}</td>
            <td class="num">${row.crownsAgainst}</td>
            <td class="num">${row.crownDiff > 0 ? '+' : ''}${row.crownDiff}</td>
            <td class="num">${row.sanctionPoints}</td>
            <td class="num"><strong>${row.points}</strong></td>
          </tr>`,
        )
        .join('');

      reply.type('text/html; charset=utf-8');
      return layout({
        title: 'Clasificacion',
        active: '/admin/standings',
        adminName: admin.displayName,
        flash: flashOf(request),
        body: `
        <h1>Clasificacion</h1>
        <p class="lead">Calculada por el motor a partir de resultados y sanciones. No es editable.</p>
        <section class="panel">
          <div class="scroll"><table>
            <caption class="muted small right">Desempates: ${standings.tiebreakers.join(' &rarr; ')}</caption>
            <thead><tr>
              <th class="num">POS</th><th>Jugador</th><th class="num">PJ</th><th class="num">VG</th>
              <th class="num">VP</th><th class="num">V3C</th><th class="num">CF</th><th class="num">CC</th>
              <th class="num">DC</th><th class="num">SAN</th><th class="num">PTS</th>
            </tr></thead>
            <tbody>${rows}</tbody>
          </table></div>
        </section>`,
      });
    });

    /* ------------------------------- Sanciones ---------------------------- */

    panel.get('/admin/sanctions', async (request, reply) => {
      const admin = currentAdmin(request);
      const sanctions = await listAllSanctions(ctx);
      const { listPlayers } = await import('../services/players.ts');
      const players = await listPlayers(ctx);

      const rows = sanctions
        .map(
          (sanction) => `<tr>
            <td>${escapeHtml(sanction.playerName)}</td>
            <td>${escapeHtml(sanction.type)}</td>
            <td class="num">${sanction.points}</td>
            <td class="small">${escapeHtml(sanction.reason)}</td>
            <td>${statusBadge(sanction.status)}</td>
            <td class="small">${formatDate(sanction.issuedAt)}</td>
            <td class="right">${
              sanction.status === 'ACTIVE'
                ? `<form method="post" action="/admin/sanctions/${sanction.id}/revoke" class="row">
                     <input name="reason" placeholder="Motivo de la anulacion" required minlength="3">
                     <button type="submit" class="danger">Anular</button>
                   </form>`
                : `<span class="muted small">${escapeHtml(sanction.revokedReason ?? '')}</span>`
            }</td>
          </tr>`,
        )
        .join('');

      reply.type('text/html; charset=utf-8');
      return layout({
        title: 'Sanciones',
        active: '/admin/sanctions',
        adminName: admin.displayName,
        flash: flashOf(request),
        body: `
        <h1>Sanciones</h1>
        <p class="lead">No hay deteccion automatica: toda sancion la registra un administrador y queda auditada.</p>

        <section class="panel">
          <h2>Registrar sancion</h2>
          <form method="post" action="/admin/sanctions" class="stack">
            <label>Jugador<select name="playerId" required>${players.players
              .map(
                (player) =>
                  `<option value="${player.id}">${escapeHtml(player.displayName)}</option>`,
              )
              .join('')}</select></label>
            <label>Tipo<select name="type">
              <option value="BM">BM (conducta antideportiva)</option>
              <option value="NO_SHOW">Incomparecencia</option>
              <option value="RULE_BREACH">Incumplimiento del reglamento</option>
              <option value="OTHER">Otro</option>
            </select></label>
            <label>Penalizacion<input name="points" type="number" min="-20" max="0" value="-2"></label>
            <label>Motivo<textarea name="reason" rows="2" required minlength="3" maxlength="500"></textarea></label>
            <label>Evidencia (URL, opcional)<input name="evidenceUrl" type="url"></label>
            <button type="submit" class="primary">Registrar</button>
          </form>
        </section>

        <section class="panel">
          <h2>Historial</h2>
          <div class="scroll"><table><thead><tr><th>Jugador</th><th>Tipo</th><th class="num">Puntos</th><th>Motivo</th><th>Estado</th><th>Fecha</th><th></th></tr></thead>
          <tbody>${rows.length === 0 ? '<tr><td colspan="7" class="muted small">Sin sanciones.</td></tr>' : rows}</tbody></table></div>
        </section>`,
      });
    });

    panel.post('/admin/sanctions', async (request, reply) => {
      const form = body<{
        playerId?: string;
        type?: string;
        points?: string;
        reason?: string;
        evidenceUrl?: string;
      }>(request);
      return run(reply, '/admin/sanctions', async () => {
        const points = Number(form.points);
        const evidenceUrl = optionalText(form.evidenceUrl);
        await createNewSanction(ctx, currentAdmin(request), {
          playerId: form.playerId ?? '',
          type: (form.type ?? 'BM') as Parameters<typeof createNewSanction>[2]['type'],
          reason: form.reason ?? '',
          ...(Number.isFinite(points) ? { points } : {}),
          ...(evidenceUrl === null ? {} : { evidenceUrl }),
        });
        return 'Sancion registrada.';
      });
    });

    panel.post('/admin/sanctions/:id/revoke', async (request, reply) => {
      const { id } = request.params as { id: string };
      const form = body<{ reason?: string }>(request);
      return run(reply, '/admin/sanctions', async () => {
        await revokeExistingSanction(ctx, currentAdmin(request), id, form.reason ?? '');
        return 'Sancion anulada; queda constancia.';
      });
    });

    /* ------------------------------- Auditoria ---------------------------- */

    panel.get('/admin/audit', async (request, reply) => {
      const admin = currentAdmin(request);
      const { tournament } = await requireTournament(ctx.db, ctx.config.tournamentSlug);
      const rows = await listAudit(ctx.db, tournament.id, { limit: 200 });

      reply.type('text/html; charset=utf-8');
      return layout({
        title: 'Auditoria',
        active: '/admin/audit',
        adminName: admin.displayName,
        flash: flashOf(request),
        body: `
        <h1>Auditoria</h1>
        <p class="lead">Toda accion con efecto sobre la competicion, con su autor y su momento.</p>
        <section class="panel">
          <div class="scroll"><table><thead><tr><th>Fecha</th><th>Accion</th><th>Entidad</th><th>Autor</th><th>Detalle</th></tr></thead>
          <tbody>${rows
            .map(
              (row) => `<tr>
                <td class="small">${formatDate(row.createdAt)}</td>
                <td>${escapeHtml(row.action)}</td>
                <td class="small">${escapeHtml(row.entityType)}<br><span class="muted">${escapeHtml(row.entityId ?? '')}</span></td>
                <td class="small">${escapeHtml(row.actor ?? 'sistema')}</td>
                <td class="small"><code>${escapeHtml(JSON.stringify(row.payload))}</code></td>
              </tr>`,
            )
            .join('')}</tbody></table></div>
        </section>`,
      });
    });
  });
}
