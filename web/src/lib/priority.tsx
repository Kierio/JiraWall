// Jira-style priority icons. The shape carries the meaning (double chevron up …
// double chevron down), so colour is never the only cue. One set of path data
// feeds React, the plain-DOM animation banners, and canvas (chart axis labels).

import { PRIORITY_LABEL, priorityLevel, type PriorityLevel } from '../../../shared/priority';
import type { ThemeName } from './format';

const PATHS: Record<PriorityLevel, string> = {
  highest: 'M3 8.5 8 3.5l5 5M3 13 8 8l5 5',
  high: 'M3 10.5 8 5.5l5 5',
  medium: 'M3 5.5h10M3 10.5h10',
  low: 'M3 5.5 8 10.5l5-5',
  lowest: 'M3 3 8 8l5-5M3 7.5 8 12.5l5-5',
  unknown: '',
};

/** Hex colours per theme (canvas can't read CSS variables). Mirrors --prio-* in styles.css. */
export const PRIORITY_COLORS: Record<ThemeName, Record<PriorityLevel, string>> = {
  dark: { highest: '#e5484d', high: '#ec835a', medium: '#fab219', low: '#3987e5', lowest: '#8094ad', unknown: '#898781' },
  light: { highest: '#c62828', high: '#d9622b', medium: '#b07400', low: '#2a78d6', lowest: '#6b7a90', unknown: '#898781' },
};

function svgInner(level: PriorityLevel, color: string): string {
  if (level === 'unknown') return `<circle cx="8" cy="8" r="3" fill="${color}"/>`;
  return `<path d="${PATHS[level]}" fill="none" stroke="${color}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`;
}

/** SVG markup for plain-DOM use (animation banners). Colour defaults to the theme token. */
export function priorityIconMarkup(name: string, size: number, color?: string): string {
  const level = priorityLevel(name);
  const label = escapeAttr(name || PRIORITY_LABEL[level]);
  return `<svg class="prio-icon" width="${size}" height="${size}" viewBox="0 0 16 16" role="img" aria-label="${label} priority"><title>${label} priority</title>${svgInner(level, color ?? `var(--prio-${level})`)}</svg>`;
}

const imageCache = new Map<string, HTMLImageElement>();

/** A decoded image of the icon for drawing on canvas. */
export function priorityIconImage(name: string, theme: ThemeName): HTMLImageElement {
  const level = priorityLevel(name);
  const key = `${level}-${theme}`;
  let img = imageCache.get(key);
  if (!img) {
    img = new Image();
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 16 16">${svgInner(level, PRIORITY_COLORS[theme][level])}</svg>`;
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    imageCache.set(key, img);
  }
  return img;
}

export function PriorityIcon({ name, size = 20 }: { name: string; size?: number }) {
  const level = priorityLevel(name);
  const label = name || PRIORITY_LABEL[level];
  return (
    <svg className="prio-icon" width={size} height={size} viewBox="0 0 16 16" role="img" aria-label={`${label} priority`}>
      <title>{`${label} priority`}</title>
      {level === 'unknown' ? (
        <circle cx="8" cy="8" r="3" fill={`var(--prio-${level})`} />
      ) : (
        <path d={PATHS[level]} fill="none" stroke={`var(--prio-${level})`} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      )}
    </svg>
  );
}

function escapeAttr(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}
