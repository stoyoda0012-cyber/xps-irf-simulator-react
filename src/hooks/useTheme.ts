import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { getInitialTheme, saveTheme } from '../lib/theme';
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

  const toggleTheme = useCallback(() => {
    setTheme(prev => (prev === 'light' ? 'dark' : 'light'));
  }, []);

  return [theme, toggleTheme];
}
