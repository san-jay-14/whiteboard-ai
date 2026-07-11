import { useSyncExternalStore } from 'react';

// App theme, stored as a tiny external store so any component can read/toggle
// it without prop-drilling. Applies a `.dark` class to <html> (Tailwind v4
// dark variant, see index.css) and persists the explicit choice; first run
// follows the OS preference.
export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'wb:theme';
const listeners = new Set<() => void>();

function systemPref(): Theme {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function load(): Theme {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'dark' || saved === 'light') return saved;
  } catch {
    // ignore
  }
  return systemPref();
}

let current: Theme = load();

function apply(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
}
apply(current);

export function getTheme(): Theme {
  return current;
}

export function setTheme(theme: Theme) {
  current = theme;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // ignore
  }
  apply(theme);
  listeners.forEach((l) => l());
}

export function toggleTheme() {
  setTheme(current === 'dark' ? 'light' : 'dark');
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, getTheme, getTheme);
}
