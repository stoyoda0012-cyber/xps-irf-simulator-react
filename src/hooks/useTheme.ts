import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { getInitialTheme, saveTheme, THEME_STORAGE_KEY } from '../lib/theme';
import type { Theme } from '../lib/theme';

/** Theme state for a page: sets data-theme on <html> and remembers the choice */
export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  // useLayoutEffect (not useEffect): the charts read the theme's CSS variables
  // via getComputedStyle inside their own useEffect, and child passive effects
  // run before the parent's. A layout effect runs before every passive effect,
  // so the attribute is in place before a chart is rebuilt with the new colours.
  useLayoutEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    saveTheme(theme);
  }, [theme]);

  // Follow a change made in another tab (the docs pages, the other app page)
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === THEME_STORAGE_KEY) setTheme(getInitialTheme());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(prev => (prev === 'light' ? 'dark' : 'light'));
  }, []);

  return [theme, toggleTheme];
}
