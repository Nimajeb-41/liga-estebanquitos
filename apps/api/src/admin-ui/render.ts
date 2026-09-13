/**
 * Render del panel de administracion.
 *
 * HTML servido desde el propio backend, sin JavaScript y sin estilos en linea:
 * formularios normales con POST y redireccion. Eso lo hace compatible con una
 * CSP estricta, rapido en cualquier movil y facil de reemplazar en la Fase 2
 * por la interfaz definitiva, que consumira la misma API.
 *
 * Los colores ya son los tokens del tema cyberpunk documentado, pero aplicados
 * con sobriedad: en Fase 1 manda la claridad, no el espectaculo.
 */

export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export const ADMIN_CSS = `
:root {
  --bg-void: #05060a;
  --bg-panel: #0c0f17;
  --bg-elevated: #141926;
  --border: #232a3d;
  --neon-cyan: #00e5ff;
  --neon-magenta: #ff2ecc;
  --neon-acid: #b6ff3b;
  --danger: #ff4d5e;
  --warning: #ffc046;
  --text-primary: #e8ecf5;
  --text-muted: #8e9ab5;
  --radius: 10px;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--bg-void);
  color: var(--text-primary);
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  font-size: 15px;
  line-height: 1.5;
}
a { color: var(--neon-cyan); }
header.top {
  display: flex; flex-wrap: wrap; gap: 16px; align-items: center;
  padding: 14px 20px; background: var(--bg-panel);
  border-bottom: 1px solid var(--border);
}
header.top .brand { font-weight: 700; letter-spacing: .04em; text-transform: uppercase; }
header.top nav { display: flex; flex-wrap: wrap; gap: 4px; }
header.top nav a {
  padding: 6px 12px; border-radius: var(--radius); text-decoration: none;
  color: var(--text-muted);
}
header.top nav a:hover { background: var(--bg-elevated); color: var(--text-primary); }
header.top nav a[aria-current="page"] { background: var(--bg-elevated); color: var(--neon-cyan); }
header.top .session { margin-left: auto; display: flex; gap: 10px; align-items: center; color: var(--text-muted); }
main { max-width: 1180px; margin: 0 auto; padding: 24px 20px 64px; }
h1 { font-size: 24px; margin: 0 0 4px; }
h2 { font-size: 18px; margin: 32px 0 12px; }
p.lead { color: var(--text-muted); margin: 0 0 24px; }
section.panel {
  background: var(--bg-panel); border: 1px solid var(--border);
  border-radius: var(--radius); padding: 18px; margin-bottom: 20px;
}
.grid { display: grid; gap: 14px; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); }
.stat { background: var(--bg-elevated); border: 1px solid var(--border); border-radius: var(--radius); padding: 14px; }
.stat .value { font-size: 26px; font-weight: 700; font-variant-numeric: tabular-nums; }
.stat .label { color: var(--text-muted); font-size: 13px; text-transform: uppercase; letter-spacing: .06em; }
table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
.scroll { overflow-x: auto; }
th, td { text-align: left; padding: 9px 10px; border-bottom: 1px solid var(--border); }
th { color: var(--text-muted); font-size: 12px; text-transform: uppercase; letter-spacing: .06em; }
tbody tr:hover { background: var(--bg-elevated); }
td.num, th.num { text-align: right; }
.badge {
  display: inline-block; padding: 2px 9px; border-radius: 999px;
  font-size: 12px; border: 1px solid var(--border); background: var(--bg-elevated);
}
.badge.scheduled { color: var(--text-muted); }
.badge.live { color: var(--neon-magenta); border-color: var(--neon-magenta); }
.badge.completed { color: var(--neon-acid); }
.badge.postponed { color: var(--warning); border-color: var(--warning); }
.badge.disputed { color: var(--danger); border-color: var(--danger); }
.badge.cancelled { color: var(--text-muted); text-decoration: line-through; }
.badge.confirmed { color: var(--neon-acid); }
.badge.registered { color: var(--text-muted); }
.badge.withdrawn, .badge.replaced { color: var(--danger); }
.badge.tbd { color: var(--text-muted); border-style: dashed; }
form.inline { display: inline; }
form.stack { display: grid; gap: 10px; max-width: 520px; }
form.row { display: flex; flex-wrap: wrap; gap: 8px; align-items: end; }
label { display: grid; gap: 4px; font-size: 13px; color: var(--text-muted); }
input, select, textarea {
  background: var(--bg-void); color: var(--text-primary);
  border: 1px solid var(--border); border-radius: 8px; padding: 8px 10px;
  font: inherit; min-width: 0;
}
input:focus-visible, select:focus-visible, textarea:focus-visible, button:focus-visible, a:focus-visible {
  outline: 2px solid var(--neon-cyan); outline-offset: 2px;
}
button {
  background: var(--bg-elevated); color: var(--text-primary); font: inherit;
  border: 1px solid var(--border); border-radius: 8px; padding: 8px 14px; cursor: pointer;
}
button:hover { border-color: var(--neon-cyan); color: var(--neon-cyan); }
button.primary { border-color: var(--neon-cyan); color: var(--neon-cyan); }
button.danger { border-color: var(--danger); color: var(--danger); }
.flash { border-radius: var(--radius); padding: 12px 14px; margin-bottom: 18px; border: 1px solid; }
.flash.ok { border-color: var(--neon-acid); color: var(--neon-acid); background: rgba(182,255,59,.07); }
.flash.err { border-color: var(--danger); color: var(--danger); background: rgba(255,77,94,.07); }
.muted { color: var(--text-muted); }
.small { font-size: 13px; }
.right { text-align: right; }
ul.history { list-style: none; padding: 0; margin: 0; display: grid; gap: 10px; }
ul.history li { border-left: 2px solid var(--border); padding-left: 12px; }
code { background: var(--bg-elevated); padding: 1px 5px; border-radius: 5px; font-size: 13px; }
.login { max-width: 380px; margin: 12vh auto; }
@media (max-width: 700px) {
  header.top { gap: 8px; }
  header.top .session { margin-left: 0; width: 100%; }
}
`;

const NAV = [
  { href: '/admin', label: 'Panel' },
  { href: '/admin/players', label: 'Participantes' },
  { href: '/admin/fixture', label: 'Calendario' },
  { href: '/admin/standings', label: 'Clasificacion' },
  { href: '/admin/sanctions', label: 'Sanciones' },
  { href: '/admin/audit', label: 'Auditoria' },
] as const;

export interface LayoutOptions {
  readonly title: string;
  readonly active?: string;
  readonly adminName?: string | null;
  readonly flash?: { ok?: string | undefined; err?: string | undefined };
  readonly body: string;
}

export function layout(options: LayoutOptions): string {
  const nav = NAV.map(
    (item) =>
      `<a href="${item.href}"${options.active === item.href ? ' aria-current="page"' : ''}>${escapeHtml(item.label)}</a>`,
  ).join('');

  const flash = [
    options.flash?.ok === undefined
      ? ''
      : `<p class="flash ok">${escapeHtml(options.flash.ok)}</p>`,
    options.flash?.err === undefined
      ? ''
      : `<p class="flash err">${escapeHtml(options.flash.err)}</p>`,
  ].join('');

  const session =
    options.adminName === undefined || options.adminName === null
      ? ''
      : `<div class="session"><span class="small">${escapeHtml(options.adminName)}</span>
         <form method="post" action="/admin/logout" class="inline"><button type="submit">Salir</button></form></div>`;

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(options.title)} · Liga Estabanquitos 2026-1</title>
<link rel="stylesheet" href="/admin/style.css">
</head>
<body>
<header class="top">
  <span class="brand">Liga Estabanquitos</span>
  <nav>${nav}</nav>
  ${session}
</header>
<main>
${flash}
${options.body}
</main>
</body>
</html>`;
}

export function statusBadge(status: string): string {
  return `<span class="badge ${status.toLowerCase()}">${escapeHtml(status)}</span>`;
}

export function formatDate(value: Date | string | null): string {
  if (value === null) return '<span class="muted">sin fecha</span>';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '<span class="muted">sin fecha</span>';
  return escapeHtml(
    date.toLocaleString('es-UY', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }),
  );
}
