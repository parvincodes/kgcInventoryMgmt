import { useSyncExternalStore } from 'react';

/** Display language for product names. Stored on this device only; the database always keeps English. */
export type Lang = 'en' | 'pa';

const KEY = 'displayLang';
const listeners = new Set<() => void>();

function read(): Lang {
  try {
    return localStorage.getItem(KEY) === 'pa' ? 'pa' : 'en';
  } catch {
    return 'en';
  }
}

let current: Lang = read();

export function setLang(next: Lang) {
  current = next;
  try {
    localStorage.setItem(KEY, next);
  } catch {
    // Private browsing can block storage. The choice still lasts for this visit.
  }
  listeners.forEach((f) => f());
}

function subscribe(f: () => void) {
  listeners.add(f);
  return () => {
    listeners.delete(f);
  };
}

export function useLang(): Lang {
  return useSyncExternalStore(subscribe, () => current, () => 'en');
}

/** The name to show for a product in the chosen language. Falls back to English when there is no translation. */
export function productName(item: { name: string; namePa?: string | null }, lang: Lang): string {
  return lang === 'pa' && item.namePa ? item.namePa : item.name;
}
