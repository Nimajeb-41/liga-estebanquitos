/**
 * Navegación.
 *
 * Un único sitio define las secciones: la cabecera, el menú móvil y el pie las
 * leen de aquí, así que no se desincronizan.
 */

export interface NavItem {
  readonly href: string;
  readonly label: string;
  /** Texto corto para la barra inferior en móvil. */
  readonly short: string;
}

export const PUBLIC_NAV: readonly NavItem[] = [
  { href: '/clasificacion', label: 'Clasificación', short: 'Tabla' },
  { href: '/calendario', label: 'Calendario', short: 'Fechas' },
  { href: '/partidos', label: 'Partidos', short: 'Partidos' },
  { href: '/jugadores', label: 'Jugadores', short: 'Jugadores' },
  { href: '/estadisticas', label: 'Estadísticas', short: 'Stats' },
];

export const SECONDARY_NAV: readonly NavItem[] = [
  { href: '/transmision', label: 'Transmisión', short: 'Directo' },
  { href: '/cara-a-cara', label: 'Cara a cara', short: 'H2H' },
  { href: '/cartas', label: 'Cartas', short: 'Cartas' },
  { href: '/sanciones', label: 'Sanciones', short: 'Sanciones' },
  { href: '/reglamento', label: 'Reglamento', short: 'Reglas' },
  { href: '/sobre-la-liga', label: 'Sobre la liga', short: 'Liga' },
];

export const ADMIN_NAV: readonly NavItem[] = [
  { href: '/admin', label: 'Resumen', short: 'Resumen' },
  { href: '/admin/temporada', label: 'Temporada', short: 'Temporada' },
  { href: '/admin/players', label: 'Participantes', short: 'Jugadores' },
  { href: '/admin/fixtures', label: 'Calendario', short: 'Calendario' },
  { href: '/admin/jornadas', label: 'Jornadas', short: 'Jornadas' },
  { href: '/admin/matches', label: 'Partidos', short: 'Partidos' },
  { href: '/admin/standings', label: 'Clasificación', short: 'Tabla' },
  { href: '/admin/sanctions', label: 'Sanciones', short: 'Sanciones' },
  { href: '/admin/clash-royale', label: 'Clash Royale', short: 'Clash' },
  { href: '/admin/stream', label: 'Transmisión', short: 'Stream' },
  { href: '/admin/rules', label: 'Reglamento', short: 'Reglas' },
  { href: '/admin/auditoria', label: 'Auditoría', short: 'Auditoría' },
];

/**
 * ¿Está activa esta entrada para la ruta actual?
 *
 * `/admin` solo se activa en la coincidencia exacta; el resto también con sus
 * subrutas, para que `/partidos/xyz` marque «Partidos».
 */
export function isActive(pathname: string, href: string): boolean {
  const clean = pathname.replace(/\/+$/, '') || '/';
  if (href === '/' || href === '/admin') return clean === href;
  return clean === href || clean.startsWith(`${href}/`);
}
