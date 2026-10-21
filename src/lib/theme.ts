/**
 * Light / dark theme. The colours are CSS custom properties in App.css under
 * [data-theme="light"] and [data-theme="dark"] on <html>; uPlot and canvas
 * drawing read them with themeColor().
 */

export type Theme = 'light' | 'dark';

// Shared by the simulator and the spectrum browser page; the inline script in
// index.html and browser.html reads it too, to set the theme before first paint
export const THEME_STORAGE_KEY = 'xps-irf-theme';

export function getInitialTheme(): Theme {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    // Storage blocked (private window, sandboxed frame): use the default
  }
  return 'light';
}

export function saveTheme(theme: Theme): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Not persisted; the choice still holds for this page
  }
}

/**
 * Current value of a theme colour, e.g. themeColor('--chart-axis').
 * Call it from an effect, not during render: data-theme changes in a layout
 * effect, so a read during render still sees the previous theme.
 */
export function themeColor(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
