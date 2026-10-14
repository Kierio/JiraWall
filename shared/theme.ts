import type { Settings } from './types.js';

/** Minutes since midnight for "HH:MM"; undefined if malformed. */
export function parseClock(value: string): number | undefined {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return undefined;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h < 24 && min < 60 ? h * 60 + min : undefined;
}

/**
 * The theme a screen should show right now. 'scheduled' is light from lightFrom
 * (inclusive) until lightUntil (exclusive); the window may cross midnight.
 */
export function effectiveTheme(settings: Pick<Settings, 'theme' | 'lightFrom' | 'lightUntil'>, now: Date): 'dark' | 'light' {
  if (settings.theme !== 'scheduled') return settings.theme === 'light' ? 'light' : 'dark';
  const from = parseClock(settings.lightFrom);
  const until = parseClock(settings.lightUntil);
  if (from === undefined || until === undefined || from === until) return 'dark';
  const t = now.getHours() * 60 + now.getMinutes();
  const light = from < until ? t >= from && t < until : t >= from || t < until;
  return light ? 'light' : 'dark';
}
