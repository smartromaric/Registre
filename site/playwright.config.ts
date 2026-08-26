import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;

/*
 * `localhost` et NON `127.0.0.1` — piège coûteux, trouvé en exécutant les tests.
 *
 * Le serveur de développement de Next 16 protège `/_next/*` par une vérification
 * d'origine. Servie sur `127.0.0.1`, la page rend son HTML normalement mais TOUS
 * ses chunks JavaScript reviennent en **403** : rien ne s'hydrate, aucun effet ne
 * tourne, et `window.__registre` reste vide. Le symptôme est trompeur — la page
 * a l'air correcte à la capture d'écran, et chaque test échoue sur un délai
 * d'attente qui semble venir de l'animation.
 */
const HOST = "localhost";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: `http://${HOST}:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    // PLAYBOOK §4 : « ajoutez-y une passe sur un contexte tactile — c'est là que
    // se cachent les défauts ». Le marché visé est justement celui du téléphone
    // d'entrée de gamme, cette passe n'est pas décorative.
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: `npm run dev -- --port ${PORT}`,
    url: `http://${HOST}:${PORT}`,
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
