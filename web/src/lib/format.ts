export const formatNumber = (n: number) => new Intl.NumberFormat().format(n);

export function timeAgo(t: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return ((parts[0][0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

/** Dark-mode categorical slots, fixed order (see styles.css). */
export const SERIES = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'];
export const OTHER_COLOR = '#5f5e5a';

/**
 * Remembers which colour slot each label got, so a category keeps its colour when
 * others come and go (colour follows the entity, never its rank).
 */
export class ColorMemory {
  private slots = new Map<string, number>();

  colorFor(label: string): string {
    if (label === 'Other') return OTHER_COLOR;
    let slot = this.slots.get(label);
    if (slot === undefined) {
      const used = new Set(this.slots.values());
      slot = SERIES.findIndex((_, i) => !used.has(i));
      if (slot === -1) slot = this.slots.size % SERIES.length;
      this.slots.set(label, slot);
    }
    return SERIES[slot];
  }
}

export const STATUS = { good: '#0ca30c', warning: '#fab219', serious: '#ec835a', critical: '#d03b3b' };

export const PRIORITY_ICON: Record<string, string> = {
  highest: '⏫',
  high: '🔼',
  medium: '⏺️',
  low: '🔽',
  lowest: '⏬',
};
