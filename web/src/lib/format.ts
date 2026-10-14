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

export type ThemeName = 'dark' | 'light';

export interface Palette {
  /** Categorical slots in fixed order (validated per theme with the dataviz validator). */
  series: string[];
  other: string;
  surface: string;
  grid: string;
  axis: string;
  ink: string;
  inkSecondary: string;
  muted: string;
}

export const PALETTES: Record<ThemeName, Palette> = {
  dark: {
    series: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'],
    other: '#5f5e5a',
    surface: '#1a1a19',
    grid: '#2c2c2a',
    axis: '#383835',
    ink: '#ffffff',
    inkSecondary: '#c3c2b7',
    muted: '#898781',
  },
  light: {
    series: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'],
    other: '#a8a79f',
    surface: '#fcfcfb',
    grid: '#e1e0d9',
    axis: '#c3c2b7',
    ink: '#0b0b0b',
    inkSecondary: '#52514e',
    muted: '#6f6e69',
  },
};

/** rgba() of a #rrggbb colour. */
export function withAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/**
 * Remembers which colour slot each label got, so a category keeps its colour when
 * others come and go (colour follows the entity, never its rank) and across themes.
 */
export class ColorMemory {
  private slots = new Map<string, number>();

  colorFor(label: string, palette: Palette): string {
    if (label === 'Other') return palette.other;
    let slot = this.slots.get(label);
    if (slot === undefined) {
      const used = new Set(this.slots.values());
      slot = palette.series.findIndex((_, i) => !used.has(i));
      if (slot === -1) slot = this.slots.size % palette.series.length;
      this.slots.set(label, slot);
    }
    return palette.series[slot];
  }
}

export const STATUS = { good: '#0ca30c', warning: '#fab219', serious: '#ec835a', critical: '#d03b3b' };
