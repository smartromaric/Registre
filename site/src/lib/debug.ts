/**
 * Exposition de l'état pour les tests — playbook §4.
 *
 * Ni secret, ni coûteux : sans cela, un test Playwright ne peut vérifier que des
 * pixels. Avec, il vérifie la **réalité** — la progression réelle d'une phase,
 * l'opacité effective d'un calque, l'état de la file hors-ligne.
 */
type DebugBag = Record<string, unknown>;

declare global {
  interface Window {
    __registre?: DebugBag;
  }
}

export function expose(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  window.__registre = window.__registre ?? {};
  window.__registre[key] = value;
}
