import { AcceptInvitationForm } from "./accept-invitation-form";

/** Même raison qu'en `(auth)/reinitialiser-mot-de-passe` : Composant Serveur qui
 * passe `token` en prop plutôt que `useSearchParams()` côté client. */
export default async function AcceptInvitationPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return <AcceptInvitationForm token={token ?? null} />;
}
