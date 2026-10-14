import { createContext, useContext, useEffect, useState } from 'react';
import { effectiveTheme } from '../../../shared/theme';
import type { Settings } from '../../../shared/types';
import { PALETTES, type Palette, type ThemeName } from './format';

export const ThemeContext = createContext<ThemeName>('dark');

export function usePalette(): Palette {
  return PALETTES[useContext(ThemeContext)];
}

type ThemeSettings = Pick<Settings, 'theme' | 'lightFrom' | 'lightUntil'>;

/**
 * Works out the theme to show (re-checking every minute so "scheduled" flips on
 * time) and applies it to <html data-theme>, which switches the CSS tokens.
 */
export function useAppliedTheme(settings: ThemeSettings | undefined): ThemeName {
  const compute = () => (settings ? effectiveTheme(settings, new Date()) : 'dark');
  const [theme, setTheme] = useState<ThemeName>(compute);

  useEffect(() => {
    setTheme(compute());
    if (settings?.theme !== 'scheduled') return;
    const timer = setInterval(() => setTheme(compute()), 30_000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings?.theme, settings?.lightFrom, settings?.lightUntil]);

  const ready = Boolean(settings);
  useEffect(() => {
    if (!ready) return; // wait for the real setting rather than flashing the default
    const html = document.documentElement;
    html.dataset.theme = theme;
    if (!html.classList.contains('theme-fade')) {
      // First theme: apply it instantly (reading a computed style forces the browser to
      // settle it now), then enable fading for later switches.
      void getComputedStyle(document.body).backgroundColor;
      html.classList.add('theme-fade');
    }
  }, [theme, ready]);

  return theme;
}

export type AdminThemeChoice = 'match' | 'dark' | 'light';
const ADMIN_THEME_KEY = 'jira-dash-admin-theme';

/** The admin page's own theme choice, remembered in this browser only. */
export function useAdminThemeChoice(): [AdminThemeChoice, (c: AdminThemeChoice) => void] {
  const [choice, setChoice] = useState<AdminThemeChoice>(() => {
    try {
      const saved = localStorage.getItem(ADMIN_THEME_KEY);
      return saved === 'dark' || saved === 'light' ? saved : 'match';
    } catch {
      return 'match';
    }
  });
  const update = (c: AdminThemeChoice) => {
    setChoice(c);
    try {
      localStorage.setItem(ADMIN_THEME_KEY, c);
    } catch {
      /* storage unavailable: choice lasts for this page view */
    }
  };
  return [choice, update];
}
