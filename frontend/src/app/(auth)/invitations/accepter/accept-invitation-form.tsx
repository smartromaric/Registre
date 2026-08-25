"use client";

/**
 * Acceptation d'une invitation par e-mail (cahier des charges §4.4,
 * MANUEL_UTILISATION.md §2) — jusqu'ici aucune interface n'existait pour ce
 * lien envoyé par `MembershipService.invite`. Trois états distincts, jamais
 * confondus :
 * - jeton invalide/expiré (`GET /auth/invitations/{token}` en 400) : rien à
 *   faire d'autre que retourner se connecter/demander une nouvelle invitation ;
 * - `already_active: true` : ce compte a déjà un mot de passe — via ce même
 *   lien déjà utilisé, ou une autre voie (connexion Google avec la même
 *   adresse). Pas de formulaire de mot de passe dans ce cas, juste renvoyer
 *   vers /login ;
 * - sinon : formulaire de mot de passe, puis connexion immédiate via
 *   `useAuth().acceptInvitation` (même mécanisme de jetons que login/signup).
 */

import { useState } from "react";
import Link from "next/link";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Loader2, TriangleAlert, UserCheck } from "lucide-react";

import { AuthCard } from "@/components/auth/auth-card";
import { FormField } from "@/components/form/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { getInvitation } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/errors";
import { useAuth } from "@/lib/auth/auth-context";
import { useRedirectIfAuthenticated } from "@/lib/auth/route-guards";

const acceptSchema = z.object({
  full_name: z.string().max(200, "200 caractères maximum.").optional(),
  password: z.string().min(8, "8 caractères minimum.").max(72, "72 caractères maximum."),
});
type AcceptValues = z.infer<typeof acceptSchema>;

function InvalidInvitationCard({ message }: { message: string }) {
  return (
    <AuthCard
      title="Invitation invalide"
      description="Ce lien ne peut pas être utilisé."
      footer={
        <Link href="/login" className="font-medium text-primary hover:underline">
          Retour à la connexion
        </Link>
      }
    >
      <div className="flex flex-col items-center gap-3 py-2 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <TriangleAlert className="size-6" />
        </span>
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>
    </AuthCard>
  );
}

export function AcceptInvitationForm({ token }: { token: string | null }) {
  useRedirectIfAuthenticated();
  const { acceptInvitation } = useAuth();
  const [acceptError, setAcceptError] = useState<string | null>(null);

  const invitationQuery = useQuery({
    queryKey: ["invitation", token],
    queryFn: () => getInvitation(token as string),
    enabled: Boolean(token),
    retry: false,
  });

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<AcceptValues>({ resolver: zodResolver(acceptSchema) });

  async function onSubmit(values: AcceptValues) {
    if (!token) return;
    try {
      await acceptInvitation({
        token,
        password: values.password,
        full_name: values.full_name?.trim() || undefined,
      });
      // Redirection prise en charge par useRedirectIfAuthenticated ci-dessus.
    } catch (error) {
      if (error instanceof ApiError && error.status === 400) {
        // Couvre à la fois "déjà acceptée" (message backend explicite,
        // AuthService.accept_invitation) et "jeton invalide/expiré" — dans les
        // deux cas, le message réel du backend suffit, pas une erreur générique.
        setAcceptError(error.message);
        return;
      }
      const message =
        error instanceof ApiError ? error.message : "Impossible d'accepter l'invitation. Réessayez.";
      toast.error(message);
    }
  }

  if (!token) {
    return <InvalidInvitationCard message="Ce lien d'invitation est invalide." />;
  }

  if (acceptError) {
    return <InvalidInvitationCard message={acceptError} />;
  }

  if (invitationQuery.isLoading) {
    return (
      <AuthCard title="Invitation" description="Vérification du lien en cours…">
        <div className="space-y-3">
          <Skeleton className="h-8 w-full rounded-lg" />
          <Skeleton className="h-8 w-full rounded-lg" />
          <Skeleton className="h-9 w-full rounded-lg" />
        </div>
      </AuthCard>
    );
  }

  if (invitationQuery.isError) {
    const message =
      invitationQuery.error instanceof ApiError
        ? invitationQuery.error.message
        : "Ce lien d'invitation est invalide ou a expiré.";
    return <InvalidInvitationCard message={message} />;
  }

  const invitation = invitationQuery.data;
  if (!invitation) return null;

  if (invitation.already_active) {
    return (
      <AuthCard
        title="Compte déjà actif"
        description={`L'invitation pour ${invitation.email} a déjà été activée.`}
        footer={
          <Link href="/login" className="font-medium text-primary hover:underline">
            Retour à la connexion
          </Link>
        }
      >
        <div className="flex flex-col items-center gap-3 py-2 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <UserCheck className="size-6" />
          </span>
          <p className="text-sm text-muted-foreground">
            Ce compte a déjà été activé — via ce lien, ou une autre voie (par exemple une connexion Google avec la
            même adresse). Connectez-vous normalement pour accéder à{" "}
            <strong className="text-foreground">{invitation.organization_name}</strong>.
          </p>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Vous êtes invité·e"
      description={`Rejoignez ${invitation.organization_name} sur Registre.`}
      footer={
        <>
          Déjà un compte ?{" "}
          <Link href="/login" className="font-medium text-primary hover:underline">
            Se connecter
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <FormField id="invitation-email" label="Adresse e-mail">
          <Input id="invitation-email" value={invitation.email} disabled readOnly />
        </FormField>

        <FormField
          id="full_name"
          label="Nom complet"
          error={errors.full_name?.message}
          hint="Facultatif — laissez vide pour garder le nom indiqué par la personne qui vous invite."
        >
          <Input
            id="full_name"
            autoComplete="name"
            placeholder="Awa Ngo"
            disabled={isSubmitting}
            {...register("full_name")}
          />
        </FormField>

        <FormField
          id="password"
          label="Créer un mot de passe"
          error={errors.password?.message}
          hint={errors.password ? undefined : "8 caractères minimum."}
        >
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            placeholder="••••••••"
            aria-invalid={Boolean(errors.password)}
            disabled={isSubmitting}
            {...register("password")}
          />
        </FormField>

        <Button type="submit" className="w-full" size="lg" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : null}
          Rejoindre {invitation.organization_name}
        </Button>
      </form>
    </AuthCard>
  );
}
