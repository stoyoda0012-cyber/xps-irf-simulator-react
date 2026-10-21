import type { Theme } from '../lib/theme';

interface ThemeToggleProps {
  theme: Theme;
  onToggle: () => void;
  title: string;
}

/** ☾ in the light theme, ☀ in the dark one (same button as xps-peak-assign) */
export function ThemeToggle({ theme, onToggle, title }: ThemeToggleProps) {
  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={onToggle}
      title={title}
      aria-label={title}
    >
      {theme === 'light' ? '☾' : '☀'}
    </button>
  );
}
