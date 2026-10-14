// Building blocks for animations. Everything moves with transform/opacity via the
// Web Animations API, so the browser can run it on the GPU (smooth on a Pi 5).

import confetti from 'canvas-confetti';
import type { DashboardEvent, Mood } from '../../../shared/types';
import { initials } from '../lib/format';

export interface Stage {
  root: HTMLElement;
  event: DashboardEvent;
  /** Total time the animation should take. */
  duration: number;
  width: number;
  height: number;
  confetti: confetti.CreateTypes;
  /** Abort signal: set when the layer is torn down. */
  cancelled: () => boolean;
}

export type PlayFn = (stage: Stage) => Promise<void>;

export const rand = (min: number, max: number) => min + Math.random() * (max - min);
export const pick = <T,>(items: T[]): T => items[Math.floor(Math.random() * items.length)];
export const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, parent?: HTMLElement): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  parent?.appendChild(node);
  return node;
}

/** Runs a keyframe animation and resolves when it finishes (or is cancelled). */
export function run(node: Element, keyframes: Keyframe[], options: KeyframeAnimationOptions): Promise<void> {
  const animation = node.animate(keyframes, { fill: 'both', ...options });
  return animation.finished.then(
    () => undefined,
    () => undefined,
  );
}

/** An emoji sprite positioned with transforms. */
export function sprite(stage: Stage, char: string, size: number): HTMLSpanElement {
  const node = el('span', 'sprite', stage.root);
  node.textContent = char;
  node.style.fontSize = `${size}px`;
  node.style.opacity = '0';
  return node;
}

export const at = (x: number, y: number, extra = '') => `translate(${x}px, ${y}px) translate(-50%, -50%) ${extra}`;

export function moodColor(mood: Mood): string {
  return mood === 'alert' ? 'var(--mood-alert)' : mood === 'info' ? 'var(--mood-info)' : 'var(--mood-celebrate)';
}

export interface BannerOptions {
  /** Entrance style. */
  enter?: 'pop' | 'drop' | 'slide-left' | 'slide-right' | 'rise' | 'shake' | 'print';
  /** Vertical position of the banner centre, as a fraction of screen height. */
  y?: number;
  tag?: string;
  delay?: number;
  /** How long the banner stays fully visible; defaults to most of the duration. */
  hold?: number;
  className?: string;
}

/**
 * The card every animation shows: avatar, banner text, ticket key and summary
 * (or a list of tickets for batched events). Resolves when it has left the screen.
 */
export async function banner(stage: Stage, options: BannerOptions = {}): Promise<HTMLElement> {
  const { event } = stage;
  const card = el('div', `banner ${options.className ?? ''}`, stage.root);
  card.style.setProperty('--mood-color', moodColor(event.mood));
  card.style.opacity = '0';
  card.style.top = `${(options.y ?? 0.5) * 100}%`;

  const person = event.count === 1 ? event.person : undefined;
  if (person) {
    const avatar = el('div', 'avatar', card);
    if (person.avatarUrl) {
      const img = el('img', undefined, avatar);
      img.referrerPolicy = 'no-referrer';
      img.src = person.avatarUrl;
      img.onerror = () => {
        avatar.textContent = initials(person.name);
      };
    } else {
      avatar.textContent = initials(person.name);
    }
  } else {
    card.classList.add('no-avatar');
  }

  const text = el('div', undefined, card);
  if (options.tag) {
    const tag = el('div', 'banner-tag', text);
    tag.textContent = options.tag;
  }
  const title = el('div', 'banner-text', text);
  title.textContent = event.bannerText;

  if (event.count === 1 && event.issues[0]) {
    const sub = el('div', 'banner-sub', text);
    sub.textContent = `${event.issues[0].key} · ${event.issues[0].summary}`;
  } else if (event.count > 1) {
    const list = el('div', 'banner-list', text);
    for (const issue of event.issues.slice(0, 5)) {
      const row = el('div', undefined, list);
      row.textContent = `${issue.key} · ${issue.summary}${issue.person ? ` — ${issue.person.name}` : ''}`;
    }
    if (event.issues.length > 5) {
      const more = el('div', 'muted', list);
      more.textContent = `…and ${event.issues.length - 5} more`;
    }
  }

  const base = 'translate(-50%, -50%)';
  const enterFrames: Record<NonNullable<BannerOptions['enter']>, Keyframe[]> = {
    pop: [
      { opacity: 0, transform: `${base} scale(0.4)` },
      { opacity: 1, transform: `${base} scale(1.06)`, offset: 0.7 },
      { opacity: 1, transform: `${base} scale(1)` },
    ],
    drop: [
      { opacity: 0, transform: `${base} translateY(-60vh)` },
      { opacity: 1, transform: `${base} translateY(3vh)`, offset: 0.75 },
      { opacity: 1, transform: `${base} translateY(0)` },
    ],
    'slide-left': [
      { opacity: 0, transform: `${base} translateX(70vw)` },
      { opacity: 1, transform: `${base} translateX(-2vw)`, offset: 0.8 },
      { opacity: 1, transform: `${base} translateX(0)` },
    ],
    'slide-right': [
      { opacity: 0, transform: `${base} translateX(-70vw)` },
      { opacity: 1, transform: `${base} translateX(2vw)`, offset: 0.8 },
      { opacity: 1, transform: `${base} translateX(0)` },
    ],
    rise: [
      { opacity: 0, transform: `${base} translateY(40vh)` },
      { opacity: 1, transform: `${base} translateY(0)` },
    ],
    shake: [
      { opacity: 0, transform: `${base} scale(1.3)` },
      { opacity: 1, transform: `${base} scale(1) translateX(0)`, offset: 0.3 },
      { transform: `${base} translateX(-24px)`, offset: 0.4 },
      { transform: `${base} translateX(20px)`, offset: 0.5 },
      { transform: `${base} translateX(-14px)`, offset: 0.6 },
      { transform: `${base} translateX(8px)`, offset: 0.7 },
      { opacity: 1, transform: `${base} translateX(0)` },
    ],
    print: [
      { opacity: 1, transform: `${base}`, clipPath: 'inset(0 0 100% 0)' },
      { opacity: 1, transform: `${base}`, clipPath: 'inset(0 0 0% 0)' },
    ],
  };

  const enter = options.enter ?? 'pop';
  const enterMs = enter === 'print' ? 1100 : 650;
  const delay = options.delay ?? 0;
  const hold = options.hold ?? Math.max(1200, stage.duration - delay - enterMs - 500);
  await run(card, enterFrames[enter], { duration: enterMs, delay, easing: enter === 'print' ? 'steps(12, end)' : 'cubic-bezier(.2,.9,.25,1)' });
  await wait(hold);
  await run(
    card,
    [
      { opacity: 1, transform: `${base} scale(1)` },
      { opacity: 0, transform: `${base} scale(0.92)` },
    ],
    { duration: 450, easing: 'ease-in' },
  );
  return card;
}

/** Fades a full-screen layer in and out around `fn`. */
export async function withLayer(stage: Stage, className: string, fn: (layer: HTMLElement) => Promise<void>, fadeMs = 400) {
  const layer = el('div', className, stage.root);
  await Promise.all([run(layer, [{ opacity: 0 }, { opacity: 1 }], { duration: fadeMs }), fn(layer)]);
  await run(layer, [{ opacity: 1 }, { opacity: 0 }], { duration: fadeMs });
  layer.remove();
}
