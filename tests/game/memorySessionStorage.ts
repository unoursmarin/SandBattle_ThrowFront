import { vi } from "vitest";

/**
 * Pas de DOM sous vitest (environnement node) : `sessionStorage` global en
 * mémoire, même contrat que le navigateur pour ce que sessionStorage.ts
 * utilise. Retourne le store sous-jacent pour y écrire des valeurs
 * corrompues à la main.
 */
export function installMemorySessionStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal("sessionStorage", {
    getItem: (key: string) => (store.has(key) ? store.get(key) : null),
    setItem: (key: string, value: string) => {
      store.set(key, String(value));
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
  } as Pick<Storage, "getItem" | "setItem" | "removeItem" | "clear">);
  return store;
}
