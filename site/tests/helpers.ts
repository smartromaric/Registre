import type { Page } from "@playwright/test";

/**
 * PLAYBOOK §4 — « exposer l'état pour pouvoir l'assert ».
 *
 * Sans ces aides, un test ne peut vérifier que des pixels. Avec, il vérifie la
 * *réalité* : la progression réelle de la chronologie, le texte effectivement
 * écrit dans la fiche, la luminance d'une surface face à son texte.
 */

/** Les six phases et leur milieu — la progression la plus représentative de chacune. */
export const PHASE_FRAMES = [
  { name: "1-gather", progress: 0.09 },
  { name: "2-declare", progress: 0.29 },
  { name: "3-ripen", progress: 0.5 },
  { name: "4-alert", progress: 0.66 },
  { name: "5-offline", progress: 0.81 },
  { name: "6-library", progress: 0.97 },
] as const;

export async function boot(page: Page): Promise<void> {
  await page.goto("/");
  // La boucle a peint au moins une fois : c'est la seule preuve que GSAP, Lenis
  // et le déclencheur sont réellement en place, plutôt qu'un simple DOM chargé.
  await page.waitForFunction(() => typeof window.__registre?.heroProgress === "number", null, { timeout: 30_000 });
}

/**
 * Place le scroll à une progression donnée de la chronologie du hero.
 *
 * Le piège : `window.scrollTo` est immédiatement rattrapé par Lenis, qui ramène
 * doucement à sa propre cible. Il faut passer par Lenis lui-même, en mode
 * immédiat. C'est pour cela que l'instance est exposée sur `window.__registre`.
 */
export async function scrollHeroTo(page: Page, progress: number): Promise<void> {
  await page.evaluate((p) => {
    const section = document.getElementById("hero");
    if (!section) throw new Error("Section #hero introuvable");
    // Bornes du déclencheur : start « top top », end « bottom bottom ».
    const start = section.offsetTop;
    const end = start + section.offsetHeight - window.innerHeight;
    const y = start + (end - start) * p;

    const lenis = window.__registre?.lenis as { scrollTo(y: number, o: { immediate: boolean }): void } | null | undefined;
    if (lenis) lenis.scrollTo(y, { immediate: true });
    else window.scrollTo(0, y);
  }, progress);

  await page.waitForFunction(
    (p) => Math.abs((window.__registre?.heroProgress as number) - p) < 0.03,
    progress,
    { timeout: 10_000 },
  );
  // Une frame de plus : la progression est à jour, mais les styles écrits par la
  // boucle ne sont pas encore forcément composés.
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

/**
 * Attend la fin de l'animation d'entrée de la légende.
 *
 * Sans cela, la planche de captures montrait des écrans **sans titre** : le
 * changement de phase remonte le bloc de légende, dont l'animation dure 560 ms,
 * et la capture tombait dans ses toutes premières frames — à `opacity: 0`. Le
 * défaut était dans la mesure, pas dans la page, mais une planche qui ment est
 * pire qu'une planche absente.
 */
export async function settleCaption(page: Page): Promise<void> {
  await page
    .waitForFunction(
      () => {
        // On interroge l'élément RÉELLEMENT animé (`[data-caption]`), pas le titre
        // qu'il contient : l'animation porte sur le bloc, et l'opacité calculée du
        // `h1` vaut 1 en permanence. Première version faite ainsi — elle rendait la
        // main aussitôt et la planche montrait des écrans sans titre.
        const el = document.querySelector("#hero [data-caption]");
        if (!el) return false;
        const running = el.getAnimations?.() ?? [];
        return running.every((a) => a.playState !== "running") && Number(getComputedStyle(el).opacity) > 0.99;
      },
      null,
      { timeout: 3_000 },
    )
    // Filet de sécurité : sur un navigateur qui n'expose pas `getAnimations`,
    // on retombe sur une attente fixe plutôt que d'échouer.
    .catch(() => page.waitForTimeout(700));
}

export async function setTheme(page: Page, theme: "light" | "dark"): Promise<void> {
  await page.evaluate((t) => {
    document.documentElement.setAttribute("data-theme", t);
  }, theme);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(r)));
}

/** Luminance relative (WCAG) d'une couleur rendue, lue via un canevas. */
export async function luminanceOf(page: Page, selector: string, prop: "color" | "backgroundColor"): Promise<number> {
  return page.evaluate(
    ({ selector, prop }) => {
      const el = document.querySelector(selector);
      if (!el) throw new Error(`Introuvable : ${selector}`);
      const value = getComputedStyle(el)[prop as "color"];

      // Le navigateur fait la conversion : `oklch()` n'est pas analysable à la
      // main, et l'écrire en dur trahirait la charte au premier changement.
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 1;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) throw new Error("Canevas 2D indisponible");
      ctx.fillStyle = value;
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;

      const channel = (c: number) => {
        const s = c / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
    },
    { selector, prop },
  );
}

export function contrastRatio(a: number, b: number): number {
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

export type ContrastOffender = { text: string; selector: string; ratio: number; color: string };

/**
 * Balaie TOUT le texte visible d'un sous-arbre et rend ceux qui n'atteignent pas
 * le rapport demandé.
 *
 * Deux précautions qui font la différence entre un test utile et un test qui
 * rassure à tort :
 * - le fond n'est pas supposé être celui du `body`. On remonte les ancêtres
 *   jusqu'au premier fond réellement opaque, sans quoi le texte posé sur une
 *   carte serait mesuré contre la page ;
 * - les titres en dégradé ont une couleur *transparente* (le dégradé est un
 *   fond détouré) : les mesurer donnerait un rapport absurde, ils sont écartés
 *   explicitement plutôt que silencieusement.
 */
export async function contrastOffenders(page: Page, root: string, minRatio: number): Promise<ContrastOffender[]> {
  return page.evaluate(
    ({ root, minRatio }) => {
      const toRgba = (value: string): [number, number, number, number] => {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 1;
        const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
        ctx.clearRect(0, 0, 1, 1);
        ctx.fillStyle = value;
        ctx.fillRect(0, 0, 1, 1);
        const d = ctx.getImageData(0, 0, 1, 1).data;
        return [d[0], d[1], d[2], d[3] / 255];
      };

      const luminance = (r: number, g: number, b: number) => {
        const ch = (c: number) => {
          const s = c / 255;
          return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
        };
        return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
      };

      /** Premier fond opaque en remontant : le fond réellement vu derrière l'élément. */
      const backdropOf = (el: Element): [number, number, number] => {
        let node: Element | null = el;
        while (node) {
          const [r, g, b, a] = toRgba(getComputedStyle(node).backgroundColor);
          if (a > 0.5) return [r, g, b];
          node = node.parentElement;
        }
        const [r, g, b] = toRgba(getComputedStyle(document.body).backgroundColor);
        return [r, g, b];
      };

      const cssPath = (el: Element) => {
        const cls = (el.className || "").toString().trim().split(/\s+/).slice(0, 3).join(".");
        return `${el.tagName.toLowerCase()}${cls ? "." + cls : ""}`;
      };

      const container = document.querySelector(root);
      if (!container) throw new Error(`Introuvable : ${root}`);

      const out: { text: string; selector: string; ratio: number; color: string }[] = [];
      const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);

      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const text = (n.textContent ?? "").trim();
        if (text.length < 2) continue;
        const el = n.parentElement;
        if (!el) continue;
        if (el.closest("[aria-hidden='true']")) continue;

        const style = getComputedStyle(el);
        if (style.visibility === "hidden" || style.display === "none") continue;
        if (Number(style.opacity) < 0.15) continue;
        // Titre en dégradé : la couleur est volontairement transparente.
        if (style.webkitBackgroundClip === "text" || style.backgroundClip === "text") continue;
        const rect = el.getBoundingClientRect();
        if (rect.width < 2 || rect.height < 2) continue;

        const [fr, fg, fb, fa] = toRgba(style.color);
        if (fa < 0.5) continue;

        const [br, bg, bb] = backdropOf(el);
        const lf = luminance(fr, fg, fb);
        const lb = luminance(br, bg, bb);
        const ratio = (Math.max(lf, lb) + 0.05) / (Math.min(lf, lb) + 0.05);

        if (ratio < minRatio) {
          out.push({ text: text.slice(0, 42), selector: cssPath(el), ratio: Math.round(ratio * 100) / 100, color: style.color });
        }
      }
      return out;
    },
    { root, minRatio },
  );
}

declare global {
  interface Window {
    __registre?: Record<string, unknown>;
  }
}
