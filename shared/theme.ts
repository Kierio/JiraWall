import type { Settings, TvSchedule } from './types.js';

/** Minutes since midnight for "HH:MM"; undefined if malformed. */
export function parseClock(value: string): number | undefined {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return undefined;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h < 24 && min < 60 ? h * 60 + min : undefined;
}

/**
 * Whether `now` falls inside the from (inclusive) – until (exclusive) window. The
 * window may cross midnight; broken or empty windows are never inside.
 */
export function inClockWindow(from: string, until: string, now: Date): boolean {
  const start = parseClock(from);
  const end = parseClock(until);
  if (start === undefined || end === undefined || start === end) return false;
  const t = now.getHours() * 60 + now.getMinutes();
  return start < end ? t >= start && t < end : t >= start || t < end;
}

/**
 * The theme a screen should show right now. 'scheduled' is light from lightFrom
 * (inclusive) until lightUntil (exclusive); the window may cross midnight.
 */
export function effectiveTheme(settings: Pick<Settings, 'theme' | 'lightFrom' | 'lightUntil'>, now: Date): 'dark' | 'light' {
  if (settings.theme !== 'scheduled') return settings.theme === 'light' ? 'light' : 'dark';
  return inClockWindow(settings.lightFrom, settings.lightUntil, now) ? 'light' : 'dark';
}

/**
 * Whether the TV schedule wants the TVs on at `now` (ignores `enabled`). A window
 * that crosses midnight belongs to the day it started on.
 */
export function tvShouldBeOn(tv: Pick<TvSchedule, 'onAt' | 'offAt' | 'days'>, now: Date): boolean {
  if (!inClockWindow(tv.onAt, tv.offAt, now)) return false;
  const start = parseClock(tv.onAt)!;
  const t = now.getHours() * 60 + now.getMinutes();
  const startDay = t >= start ? now.getDay() : (now.getDay() + 6) % 7;
  return tv.days.includes(startDay);
}
