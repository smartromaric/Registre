import { test } from "@playwright/test";

import { PHASE_FRAMES, boot, scrollHeroTo, setTheme, settleCaption } from "./helpers";

/**
 * LA PLANCHE DE CONTRÔLE — playbook §4.
 *
 * Ce fichier ne vérifie rien. Il produit une image par moment clé, dans les deux
 * thèmes. C'est l'outil de réglage de la mise en scène : on modifie deux nombres
 * dans `lib/config.ts`, on relance, **on ouvre les images**.
 *
 *     npm run shots     puis     site/tests/screenshots/
 */
test.describe("planche de captures", () => {
  for (const theme of ["dark", "light"] as const) {
    test(`hero, thème ${theme}`, async ({ page }, testInfo) => {
      await boot(page);
      await setTheme(page, theme);

      for (const frame of PHASE_FRAMES) {
        await scrollHeroTo(page, frame.progress);
        await settleCaption(page);
        await page.screenshot({
          path: `tests/screenshots/${testInfo.project.name}-${theme}-hero-${frame.name}.png`,
        });
      }
    });
  }

  test("sections", async ({ page }, testInfo) => {
    await boot(page);

    const sections = ["produit", "modeles", "hors-ligne", "tarifs"];
    for (const id of sections) {
      await page.evaluate((anchor) => {
        const el = document.getElementById(anchor);
        const lenis = window.__registre?.lenis as { scrollTo(t: number, o: { immediate: boolean }): void } | undefined;
        const y = (el?.getBoundingClientRect().top ?? 0) + window.scrollY;
        if (lenis) lenis.scrollTo(y, { immediate: true });
        else window.scrollTo(0, y);
      }, id);
      // Les sections apparaissent à l'entrée dans l'écran : laisser la
      // transition finir, sinon la planche montre des blocs à moitié révélés.
      await page.waitForTimeout(900);
      await page.screenshot({ path: `tests/screenshots/${testInfo.project.name}-section-${id}.png` });
    }

    await page.evaluate(() => {
      const lenis = window.__registre?.lenis as { scrollTo(t: number, o: { immediate: boolean }): void } | undefined;
      if (lenis) lenis.scrollTo(document.body.scrollHeight, { immediate: true });
      else window.scrollTo(0, document.body.scrollHeight);
    });
    await page.waitForTimeout(900);
    await page.screenshot({ path: `tests/screenshots/${testInfo.project.name}-section-pied.png` });
  });
});
