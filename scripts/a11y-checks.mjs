/**
 * Comprobaciones de accesibilidad sobre el HTML servido.
 *
 * No sustituyen a probar con un lector de pantalla ni a `axe`: son el subconjunto
 * que se puede verificar leyendo el HTML y que, por experiencia, es donde se
 * cuelan los fallos de verdad. Cada una tiene un nombre que dice a quien afecta,
 * porque «error de accesibilidad» no le importa a nadie y «este botón no tiene
 * nombre para un lector de pantalla» sí.
 *
 * Lo que **no** puede comprobar desde aquí: contraste (hace falta calcular el
 * color efectivo), orden de foco real, y todo lo que dependa de JavaScript ya
 * hidratado. Eso queda para los tests de componente y para una revisión manual.
 */

/** Etiquetas que se cuentan como contenido accesible dentro de un control. */
const TEXT_CONTENT = /[^\s<>][^<>]*/;

/** Quita comentarios y `<script>`/`<style>`, que no son contenido. */
function clean(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<script[\s\S]*?<\/script>/g, '')
    .replace(/<style[\s\S]*?<\/style>/g, '');
}

/** Todas las etiquetas de apertura de un tipo, con sus atributos. */
function tags(html, name) {
  const pattern = new RegExp(`<${name}\\b([^>]*)>`, 'gi');
  return [...html.matchAll(pattern)].map((match) => match[1] ?? '');
}

function hasAttr(attrs, name) {
  return new RegExp(`\\b${name}\\s*=`, 'i').test(attrs);
}

function attrValue(attrs, name) {
  const match = new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, 'i').exec(attrs);
  return match?.[1] ?? null;
}

/**
 * Problemas de accesibilidad de una página.
 *
 * Devuelve una lista de textos; vacía significa que no se encontró ninguno de
 * los que esta herramienta sabe buscar, que no es lo mismo que «es accesible».
 */
export function auditHtml(html) {
  const body = clean(html);
  const problems = [];

  /* --- Idioma. Sin esto un lector de pantalla lee español con voz inglesa. */
  const htmlTag = tags(body, 'html')[0] ?? '';
  const lang = attrValue(htmlTag, 'lang');
  if (lang === null || lang.trim() === '') {
    problems.push('el <html> no declara idioma');
  }

  /* --- Un solo <h1>: es el titular de la página para quien navega por
         encabezados. Ninguno deja la página sin punto de entrada; dos o más
         hacen imposible saber cuál es. */
  const h1s = tags(body, 'h1').length;
  if (h1s === 0) problems.push('la pagina no tiene <h1>');
  if (h1s > 1) problems.push(`la pagina tiene ${h1s} elementos <h1>`);

  /* --- Imágenes sin alt. Un `alt=""` vacío es correcto y deliberado
         (decorativa); lo que falla es no tener el atributo. */
  for (const attrs of tags(body, 'img')) {
    if (!hasAttr(attrs, 'alt')) {
      const src = attrValue(attrs, 'src') ?? '(sin src)';
      problems.push(`imagen sin alt: ${src.slice(0, 60)}`);
    }
  }

  /* --- Controles sin nombre accesible. Un botón que solo lleva un icono se
         anuncia como «botón» a secas, que no dice nada. */
  const buttons = [...body.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/gi)];
  for (const [, attrs = '', inner = ''] of buttons) {
    const labelled =
      hasAttr(attrs, 'aria-label') ||
      hasAttr(attrs, 'aria-labelledby') ||
      hasAttr(attrs, 'title') ||
      TEXT_CONTENT.test(inner.replace(/<[^>]*>/g, '').trim()) ||
      /class="[^"]*\bsr-only\b/.test(inner);
    if (!labelled) problems.push('boton sin nombre accesible');
  }

  const links = [...body.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)];
  for (const [, attrs = '', inner = ''] of links) {
    if (!hasAttr(attrs, 'href')) continue;
    const labelled =
      hasAttr(attrs, 'aria-label') ||
      hasAttr(attrs, 'aria-labelledby') ||
      hasAttr(attrs, 'title') ||
      TEXT_CONTENT.test(inner.replace(/<[^>]*>/g, '').trim());
    if (!labelled) {
      problems.push(`enlace sin texto: ${attrValue(attrs, 'href') ?? '?'}`);
    }
  }

  /* --- Campos de formulario sin etiqueta. Se acepta `aria-label`, un `<label
         for>` que apunte a su id, o `aria-labelledby`. */
  const labelledIds = new Set(
    [...body.matchAll(/<label\b[^>]*\bfor\s*=\s*"([^"]*)"/gi)].map((match) => match[1]),
  );

  for (const name of ['input', 'select', 'textarea']) {
    for (const attrs of tags(body, name)) {
      const type = (attrValue(attrs, 'type') ?? '').toLowerCase();
      if (name === 'input' && ['hidden', 'submit', 'button', 'image'].includes(type)) continue;

      const id = attrValue(attrs, 'id');
      const labelled =
        hasAttr(attrs, 'aria-label') ||
        hasAttr(attrs, 'aria-labelledby') ||
        (id !== null && labelledIds.has(id));
      if (!labelled) {
        problems.push(`campo <${name}> sin etiqueta: ${id ?? attrValue(attrs, 'name') ?? '?'}`);
      }
    }
  }

  /* --- Tablas sin encabezados: una rejilla de números sin contexto. */
  for (const [, inner = ''] of body.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)) {
    if (!/<th\b/i.test(inner)) problems.push('tabla sin celdas de encabezado');
  }

  /* --- Viewport: sin esto el movil renderiza a 980px y hay que hacer zoom. */
  if (!/<meta[^>]*\bname\s*=\s*"viewport"/i.test(body)) {
    problems.push('falta la etiqueta viewport');
  }

  /* --- `user-scalable=no` o `maximum-scale=1` impiden ampliar. Quien necesita
         ampliar no puede leer la pagina. */
  const viewport = /<meta[^>]*\bname\s*=\s*"viewport"[^>]*\bcontent\s*=\s*"([^"]*)"/i.exec(body);
  const viewportContent = viewport?.[1] ?? '';
  if (/user-scalable\s*=\s*no|maximum-scale\s*=\s*1(?!\d)/i.test(viewportContent)) {
    problems.push('el viewport impide ampliar la pagina');
  }

  return problems;
}
