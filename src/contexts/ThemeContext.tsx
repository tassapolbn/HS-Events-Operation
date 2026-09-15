import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

type Theme = 'light' | 'dark';

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
  /** Pages that must always be read in light can hold the app there while open */
  holdLight: (delta: 1 | -1) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);
const STORAGE_KEY = 'eventops.theme';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'dark' || saved === 'light') return saved;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });
  // How many open pages insist on light. The display board is the only one.
  const [lightHolds, setLightHolds] = useState(0);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark' && lightHolds === 0);
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme, lightHolds]);

  const holdLight = useCallback((delta: 1 | -1) => {
    setLightHolds((held) => Math.max(0, held + delta));
  }, []);

  return (
    <ThemeContext.Provider
      value={{ theme, toggleTheme: () => setTheme((t) => (t === 'dark' ? 'light' : 'dark')), holdLight }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}

/**
 * The display board is read on screens all over the school and nobody standing
 * in front of one can change that device's theme, so the board is always light.
 * The choice the user made for the rest of the app is remembered and comes back
 * the moment they leave the board.
 */
export function useLightModeOnly() {
  const ctx = useContext(ThemeContext);
  const hold = ctx?.holdLight;
  useEffect(() => {
    if (!hold) return;
    hold(1);
    return () => hold(-1);
  }, [hold]);
}
