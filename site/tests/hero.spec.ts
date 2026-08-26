import { expect, test } from "@playwright/test";

import { boot, contrastOffenders, scrollHeroTo } from "./helpers";

/**
 * Les tests qui vérifient la RÉALITÉ, pas la compilation — playbook §4.
 *
 * Chacun rejoue un piège précis du playbook plutôt qu'un « la page s'affiche ».
 */

test("la chronologie avance réellement avec le scroll", async ({ page }) => {
  await boot(page);

  await scrollHeroTo(page, 0.05);
  const early = await page.evaluate(() => window.__registre?.heroProgress as number);

  await scrollHeroTo(page, 0.95);
  const late = await page.evaluate(() => window.__registre?.heroProgress as number);

  expect(early).toBeLessThan(0.2);
  expect(late).toBeGreaterThan(0.8);
});

test("l'échéance mûrit : le compte à rebours change vraiment", async ({ page }) => {
  await boot(page);

  // Début de `ripen` : trente jours devant nous.
  await scrollHeroTo(page, 0.38);
  const start = await page.locator("#hero").getByText(/^J-\d+$/).first().textContent();

  // Fin de `ripen` : l'échéance tombe aujourd'hui.
  await scrollHeroTo(page, 0.53);
  const end = await page.locator("#hero").textContent();

  expect(start).toMatch(/J-(2[5-9]|30)/);
  expect(end).toContain("Expire aujourd'hui");
});

test("le hors-ligne affiche l'état réel, jamais un faux « synchronisé »", async ({ page }) => {
  await boot(page);

  // Milieu de la coupure : l'indicateur doit dire « hors ligne » ET annoncer
  // une file non vide. Un « tout est synchronisé » ici serait le mensonge que
  // le playbook §3 interdit explicitement.
  await scrollHeroTo(page, 0.78);
  const during = await page.locator("#hero").innerText();
  expect(during).toContain("Hors ligne");
  expect(during).toMatch(/\d+ en attente/);
  expect(during).not.toContain("Tout est synchronisé");

  // Après le retour du réseau, la file est vidée.
  await scrollHeroTo(page, 0.858);
  const after = await page.locator("#hero").innerText();
  expect(after).toContain("Tout est synchronisé");
});

test("la fiche se démultiplie en les six modèles", async ({ page }) => {
  await boot(page);
  await scrollHeroTo(page, 0.99);

  const hero = page.locator("#hero");
  for (const name of ["Véhicule", "Stock de gaz", "Vêtements", "Personnel", "Extincteur", "Contrat"]) {
    await expect(hero.getByText(name, { exact: true }).first()).toBeVisible();
  }
});

/**
 * PLAYBOOK §5, « une surface figée sous un texte qui bascule ».
 *
 * Un fond écrit en dur sous un texte qui suit le thème donne du sombre sur
 * sombre — sans aucune erreur, la page paraît simplement cassée. Le seul
 * garde-fou fiable est de mesurer l'écart de luminance dans les DEUX thèmes.
 */
test("le contraste tient dans les deux thèmes, sur toute la page", async ({ browser }) => {
  /*
   * UN CONTEXTE NEUF PAR THÈME, et non une bascule d'attribut en cours de page.
   *
   * Erreur de méthode qui a coûté une heure : basculer `data-theme` puis lire
   * `getComputedStyle` dans la foulée renvoie encore l'ANCIENNE couleur — le
   * recalcul de style n'a pas eu lieu. Le test accusait alors la CSS, qui était
   * juste, et j'ai « corrigé » des couleurs qui n'avaient rien. Charger la page
   * dans son thème est fiable, et c'est aussi ce que vit un vrai visiteur.
   */
  for (const theme of ["dark", "light"] as const) {
    const context = await browser.newContext({ colorScheme: theme });
    const page = await context.newPage();
    await page.addInitScript((t) => {
      try {
        localStorage.setItem("registre-site-theme", t);
      } catch {
        // Stockage refusé : le script du layout retombera sur la préférence système,
        // que `colorScheme` vient précisément de fixer.
      }
    }, theme);

    await boot(page);
    expect(await page.evaluate(() => document.documentElement.getAttribute("data-theme"))).toBe(theme);

    // On révèle tout : un élément encore à `opacity: 0` serait écarté du
    // balayage, et le test passerait en n'ayant rien regardé.
    await page.evaluate(() => {
      document.querySelectorAll("[data-reveal]").forEach((el) => el.setAttribute("data-revealed", "true"));
    });
    await scrollHeroTo(page, 0.45);

    // 4,5:1 est le seuil AA pour du texte de taille courante — celui de presque
    // tout ce que porte cette page, exergues en petites capitales compris.
    const offenders = await contrastOffenders(page, "body", 4.5);
    expect(offenders, `contraste insuffisant en thème ${theme} : ${JSON.stringify(offenders, null, 2)}`).toEqual([]);

    await context.close();
  }
});

/**
 * PLAYBOOK §6, typographie française. La règle vit dans `lib/typography.ts` ;
 * ce test vérifie qu'elle est réellement appliquée au rendu, et pas seulement
 * écrite quelque part.
 */
test("les guillemets portent bien une espace fine insécable", async ({ page }) => {
  await boot(page);
  const text = await page.locator("body").innerText();

  // Aucun chevron ouvrant suivi d'une espace ordinaire, aucun chevron fermant
  // précédé d'une espace ordinaire : ce sont eux qui tombent seuls en fin de ligne.
  expect(text).not.toMatch(/«[ \t]/);
  expect(text).not.toMatch(/[ \t]»/);
  // Et il y a bien des guillemets dans la page — sans quoi le test ne prouve rien.
  expect(text).toContain("«");
});

test("mouvement réduit : chaque phase reste lisible en statique", async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto("/");

  // Les six légendes sont rendues en texte, aucune information n'est perdue.
  for (const fragment of [
    "Vos cahiers, vos classeurs",
    "Un seul socle",
    "Une assurance expire",
    "Registre vous prévient",
    "Le réseau coupe",
    "Six modèles",
  ]) {
    await expect(page.getByText(fragment, { exact: false }).first()).toBeVisible();
  }

  await expect(page.locator("#hero")).toBeVisible();
  await context.close();
});

test("les appels à l'action mènent bien à l'application", async ({ page }) => {
  await boot(page);

  const signup = page.locator('a[href$="/signup"]').first();
  await expect(signup).toHaveAttribute("href", /\/signup$/);

  const login = page.locator('a[href$="/login"]').first();
  await expect(login).toHaveAttribute("href", /\/login$/);
});
