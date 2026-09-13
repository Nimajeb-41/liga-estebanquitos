/**
 * Movimiento de todo el sitio, con GSAP.
 *
 * Reemplaza al `reveal` de la Fase 2, que solo animaba la portada. Aquí hay
 * cuatro cosas, y ninguna se mueve mientras se lee un dato:
 *
 *   `data-reveal`      entra al aparecer en pantalla
 *   `data-count`       cuenta hasta su número
 *   `data-hero-part`   entrada escalonada de la portada
 *   `data-glow`        respiración del resplandor, solo en piezas decorativas
 *
 * Tres reglas que atraviesan el módulo:
 *
 * 1. **Si el sistema pide menos movimiento, no se anima nada.** No se atenúa:
 *    se deja todo en su estado final y se sale.
 * 2. **La página tiene que funcionar si esto falla.** Animar implica empezar
 *    invisible; si la animación no llegara a correr, la página quedaría en
 *    blanco. Cada grupo lleva su red de seguridad temporizada.
 * 3. **Se puede llamar dos veces.** Con transiciones de vista el módulo corre
 *    en cada navegación, así que todo es idempotente y limpia lo suyo.
 */

import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

function reduced(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Deja los elementos en su estado final: visibles y en su sitio. */
function settle(elements: Element[]): void {
  for (const element of elements) {
    element.classList.remove('reveal-init');
    if (element instanceof HTMLElement) {
      element.style.removeProperty('opacity');
      element.style.removeProperty('transform');
    }
  }
}

/**
 * Red de seguridad.
 *
 * Si la animación no termina —un error, o una pestaña en segundo plano donde el
 * navegador frena los fotogramas— se fuerza el estado final. Cuando todo va
 * bien no hace nada: los elementos ya están asentados.
 */
function guarantee(elements: Element[], durationMs: number): void {
  window.setTimeout(() => settle(elements), durationMs);
}

/* -------------------------------------------------------------------------- */
/* Entradas al hacer scroll                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Cada `[data-reveal]` entra cuando asoma por abajo.
 *
 * Los hermanos con el mismo padre entran escalonados, que es lo que convierte
 * una lista en algo que se lee de arriba abajo en vez de un parpadeo colectivo.
 */
/**
 * Qué se anima cuando la página no lo dice.
 *
 * Marcar a mano cada bloque de dieciséis páginas es trabajo que se olvida en la
 * página diecisiete. En vez de eso, si una página no trae ningún `data-reveal`
 * propio, se toman los hijos directos del contenido: secciones y paneles, que es
 * justo la granularidad que se quiere.
 *
 * Una página que sí los declara manda: ahí alguien pensó qué entra y qué no.
 */
function autoTargets(root: ParentNode): HTMLElement[] {
  const main = root.querySelector<HTMLElement>('main');
  if (main === null) return [];

  /*
    Las páginas envuelven su contenido en uno o dos `div` de maquetación
    (`max-w-7xl`, `space-y-6`). Animar ese envoltorio haría que la página entera
    apareciera de golpe, que es justo lo contrario de lo que se busca. Se baja
    mientras solo haya un hijo, hasta dar con el nivel donde de verdad hay
    varios bloques.
  */
  let container: HTMLElement = main;
  for (let depth = 0; depth < 3; depth += 1) {
    const children: HTMLElement[] = [...container.children].filter(
      (child): child is HTMLElement => child instanceof HTMLElement,
    );
    const only = children[0];
    if (children.length !== 1 || only === undefined) break;
    container = only;
  }

  /*
    Un `div` sin apariencia propia que agrupa varios bloques es maquetación, no
    contenido: se atraviesa para animar lo que hay dentro. Un `section`, o un
    `div` con clase `panel`, sí es una pieza y se anima entero.
  */
  const isWrapper = (element: HTMLElement): boolean =>
    element.tagName === 'DIV' &&
    !element.classList.contains('panel') &&
    !element.classList.contains('panel-glass') &&
    element.childElementCount > 1;

  const blocks: HTMLElement[] = [];
  const collect = (parent: HTMLElement, depth: number): void => {
    for (const child of parent.children) {
      if (!(child instanceof HTMLElement)) continue;
      /* Nada ya marcado, y nada minúsculo: animar un separador es ruido. */
      if (child.hasAttribute('data-reveal') || child.hasAttribute('data-revealed')) continue;
      if (child.offsetHeight < 40) continue;

      if (depth < 2 && isWrapper(child)) collect(child, depth + 1);
      else blocks.push(child);
    }
  };
  collect(container, 0);

  return blocks;
}

export function revealOnScroll(root: ParentNode = document): void {
  const declared = [...root.querySelectorAll<HTMLElement>('[data-reveal]:not([data-revealed])')];
  const targets = declared.length > 0 ? declared : autoTargets(root);
  if (targets.length === 0) return;

  for (const target of targets) target.dataset['revealed'] = '';

  if (reduced()) {
    settle(targets);
    return;
  }

  /* Agrupar por padre para escalonar solo entre hermanos. */
  const groups = new Map<Element, HTMLElement[]>();
  for (const target of targets) {
    const parent = target.parentElement ?? document.body;
    const group = groups.get(parent);
    if (group === undefined) groups.set(parent, [target]);
    else group.push(target);
  }

  for (const group of groups.values()) {
    for (const element of group) element.classList.add('reveal-init');

    gsap.to(group, {
      opacity: 1,
      y: 0,
      duration: 0.5,
      ease: 'power2.out',
      stagger: 0.07,
      scrollTrigger: {
        trigger: group[0]!,
        /*
          `start` generoso: lo que ya está en pantalla al cargar tiene que
          entrar enseguida, no esperar a que alguien haga scroll.
        */
        start: 'top 92%',
        once: true,
      },
      onComplete: () => settle(group),
    });
  }

  guarantee(targets, 2600);
}

/* -------------------------------------------------------------------------- */
/* Contadores                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * `[data-count]` cuenta desde cero hasta su valor.
 *
 * El número final va en el atributo, no se lee del texto: el texto puede traer
 * separadores de miles, y reconstruirlo sería adivinar el formato de la página.
 * Si el atributo no es un número, el elemento se deja tal cual.
 */
export function countUp(root: ParentNode = document): void {
  const targets = [...root.querySelectorAll<HTMLElement>('[data-count]:not([data-counted])')];
  if (targets.length === 0) return;

  for (const target of targets) target.dataset['counted'] = '';
  if (reduced()) return;

  for (const target of targets) {
    const end = Number(target.dataset['count']);
    if (!Number.isFinite(end)) continue;

    const decimals = Number(target.dataset['countDecimals'] ?? 0);
    const suffix = target.dataset['countSuffix'] ?? '';
    const state = { value: 0 };

    gsap.to(state, {
      value: end,
      duration: 1.1,
      ease: 'power2.out',
      scrollTrigger: { trigger: target, start: 'top 95%', once: true },
      onUpdate: () => {
        target.textContent = state.value.toFixed(decimals) + suffix;
      },
      // Sin esto, un redondeo a mitad de camino podria dejar 99 en vez de 100.
      onComplete: () => {
        target.textContent = end.toFixed(decimals) + suffix;
      },
    });
  }
}

/* -------------------------------------------------------------------------- */
/* Portada                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Entrada de la portada: marca, titular y llamadas a la acción, en ese orden.
 * Máximo 800 ms en total, que es el techo de la dirección visual.
 */
export function heroIntro(): void {
  const hero = document.querySelector('[data-hero]');
  if (hero === null) return;

  const parts = [...hero.querySelectorAll('[data-hero-part]')];
  if (parts.length === 0) return;

  if (reduced()) {
    settle(parts);
    return;
  }

  const timeline = gsap.timeline();
  timeline.fromTo(
    parts,
    { opacity: 0, y: 18 },
    { opacity: 1, y: 0, duration: 0.5, ease: 'power3.out', stagger: 0.09 },
  );

  /*
    El trofeo entra aparte: gira un poco y se asienta. Es la única pieza que se
    permite una entrada más larga, porque es la imagen de la liga.
  */
  const trophy = hero.querySelector('[data-hero-trophy]');
  if (trophy !== null) {
    timeline.fromTo(
      trophy,
      { opacity: 0, scale: 0.88, rotate: -6 },
      { opacity: 1, scale: 1, rotate: 0, duration: 0.9, ease: 'back.out(1.4)' },
      0.15,
    );
  }

  timeline.eventCallback('onComplete', () => settle([...parts, ...(trophy ? [trophy] : [])]));
  guarantee([...parts, ...(trophy === null ? [] : [trophy])], 1800);
}

/**
 * Flotación del trofeo.
 *
 * Lento y de poco recorrido: tiene que leerse como que la pieza está viva, no
 * como que se está moviendo. Se detiene cuando la pestaña deja de verse para no
 * gastar batería animando algo que nadie mira.
 */
export function floatTrophy(): void {
  const trophy = document.querySelector<HTMLElement>('[data-hero-trophy]');
  if (trophy === null || reduced()) return;

  gsap.to(trophy, {
    y: -12,
    duration: 3.2,
    ease: 'sine.inOut',
    repeat: -1,
    yoyo: true,
    // `delay` para que arranque cuando la entrada ya ha terminado.
    delay: 1,
  });
}

/* -------------------------------------------------------------------------- */
/* Arranque                                                                    */
/* -------------------------------------------------------------------------- */

/** Todo lo de esta página. Idempotente: se puede llamar en cada navegación. */
export function initMotion(): void {
  heroIntro();
  floatTrophy();
  revealOnScroll();
  countUp();
  // Tras una transición de vista el documento mide otra cosa.
  ScrollTrigger.refresh();
}

/** Se descartan los disparadores de la página que se abandona. */
export function teardownMotion(): void {
  for (const trigger of ScrollTrigger.getAll()) trigger.kill();
  gsap.globalTimeline.clear();
}
