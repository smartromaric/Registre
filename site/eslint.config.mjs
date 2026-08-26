import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Même forme que `frontend/eslint.config.mjs` : eslint-config-next 16 exporte
// des configs plates. Les passer par `FlatCompat` fait tourner en rond le
// validateur de l'ancien format (structure circulaire dans `plugins.react`).
const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "playwright-report/**", "test-results/**"]),
]);

export default eslintConfig;
