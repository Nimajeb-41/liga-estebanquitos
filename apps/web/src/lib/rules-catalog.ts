/**
 * Catálogo de reglas.
 *
 * La página del reglamento no reescribe las reglas: lee `docs/pending-rules.md`,
 * que es donde se decide qué está cerrado y qué no, y lo convierte en algo que
 * se pueda pintar. Si alguien cierra una regla en ese documento, la web cambia
 * sola. Si se copiara aquí, tarde o temprano diría otra cosa.
 *
 * El archivo se incorpora en el momento de compilar (`?raw`), así que no hace
 * falta desplegar la carpeta `docs/` para servir la página.
 */

import source from '../../../../docs/pending-rules.md?raw';

export type RuleStatus = 'DECIDED' | 'PENDING';

export interface RuleBlock {
  readonly kind: 'paragraph' | 'list';
  readonly text?: string;
  readonly items?: readonly string[];
}

export interface RuleEntry {
  readonly id: string;
  readonly title: string;
  readonly status: RuleStatus;
  /** Solo en las decididas: la fecha en la que se cerró, si consta. */
  readonly decidedOn: string | null;
  /** Solo en las pendientes: bajo qué epígrafe de urgencia aparece. */
  readonly group: string | null;
  readonly blocks: readonly RuleBlock[];
}

/** Quita el énfasis, los enlaces y el código de una línea de Markdown. */
function plain(line: string): string {
  return line
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/(?<![*\w])\*([^*]+)\*(?!\w)/g, '$1')
    .trim();
}

/** Agrupa las líneas de una regla en párrafos y listas. */
function toBlocks(lines: readonly string[]): RuleBlock[] {
  const blocks: RuleBlock[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];

  const flushParagraph = (): void => {
    if (paragraph.length === 0) return;
    blocks.push({ kind: 'paragraph', text: plain(paragraph.join(' ')) });
    paragraph = [];
  };
  const flushList = (): void => {
    if (list.length === 0) return;
    blocks.push({ kind: 'list', items: [...list] });
    list = [];
  };

  for (const raw of lines) {
    const line = raw.trimEnd();

    if (line.trim().length === 0) {
      flushParagraph();
      flushList();
      continue;
    }

    // Las citas de bloque se leen como un párrafo más.
    const withoutQuote = line.replace(/^>\s?/, '');
    const bullet = /^\s*(?:[-*]|\d+\.)\s+(.*)$/.exec(withoutQuote);

    if (bullet !== null) {
      flushParagraph();
      list.push(plain(bullet[1] ?? ''));
      continue;
    }

    flushList();
    paragraph.push(withoutQuote.trim());
  }

  flushParagraph();
  flushList();
  return blocks;
}

const HEADING = /^(#{3,4})\s+(R-\d+|P-\d+)\s+·\s+(.+)$/;
const GROUP = /^###\s+(?!R-|P-)(.+)$/;
const DECIDED_ON = /—\s*decidida el\s+([0-9-]+)\s*$/;

/**
 * Extrae las reglas del documento.
 *
 * Se apoya en la estructura que ya tiene: `## Reglas decididas` y
 * `## Reglas pendientes`, con una regla por encabezado `R-NN ·` o `P-NN ·`.
 */
export function parseRules(markdown: string): RuleEntry[] {
  const lines = markdown.split(/\r?\n/);
  const entries: RuleEntry[] = [];

  let status: RuleStatus | null = null;
  let group: string | null = null;
  let current: { id: string; title: string; decidedOn: string | null; lines: string[] } | null =
    null;

  const flush = (): void => {
    if (current === null || status === null) return;
    entries.push({
      id: current.id,
      title: current.title,
      status,
      decidedOn: current.decidedOn,
      group: status === 'PENDING' ? group : null,
      blocks: toBlocks(current.lines),
    });
    current = null;
  };

  for (const line of lines) {
    if (/^##\s+Reglas decididas/.test(line)) {
      flush();
      status = 'DECIDED';
      group = null;
      continue;
    }
    if (/^##\s+Reglas pendientes/.test(line)) {
      flush();
      status = 'PENDING';
      group = null;
      continue;
    }
    if (/^##\s+/.test(line) && !/^###/.test(line)) {
      // Cualquier otro apartado de nivel 2 cierra la seccion de reglas.
      flush();
      status = null;
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading !== null) {
      flush();
      const rawTitle = heading[3] ?? '';
      const decided = DECIDED_ON.exec(rawTitle);
      current = {
        id: heading[2] ?? '',
        title: plain(rawTitle.replace(DECIDED_ON, '')).replace(/\s*—\s*$/, ''),
        decidedOn: decided?.[1] ?? null,
        lines: [],
      };
      continue;
    }

    const groupHeading = GROUP.exec(line);
    if (groupHeading !== null && status === 'PENDING') {
      flush();
      group = plain(groupHeading[1] ?? '');
      continue;
    }

    if (current !== null && !/^---\s*$/.test(line)) {
      current.lines.push(line);
    }
  }

  flush();
  return entries;
}

/** Fecha de última actualización que declara el propio documento. */
export function parseUpdatedAt(markdown: string): string | null {
  const match = /Última actualización:\s*\*\*([^*]+)\*\*/.exec(markdown);
  return match?.[1]?.trim() ?? null;
}

export const RULES: readonly RuleEntry[] = parseRules(source as string);
export const RULES_UPDATED_AT: string | null = parseUpdatedAt(source as string);
