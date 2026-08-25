import { ResetPasswordForm } from "./reset-password-form";

/**
 * Composant Serveur (pas "use client") : lit `?token=` via le `searchParams`
 * de la Page plutôt que `useSearchParams()` côté client — évite d'avoir à
 * envelopper la page dans un `<Suspense>` juste pour un jeton d'URL (voir
 * node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md
 * §"Reading searchParams... in Client Components" : `searchParams` est une
 * promesse depuis Next 15, à passer en prop à un Composant Client).
 */
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return <ResetPasswordForm token={token ?? null} />;
}
