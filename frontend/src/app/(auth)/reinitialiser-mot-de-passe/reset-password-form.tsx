"use client";

/**
 * Formulaire de nouveau mot de passe (cahier des charges §4.4 raffinement) —
 * `POST /auth/password/reset` renvoie une `AuthResponse` identique à
 * login/signup et connecte immédiatement : on réutilise `useAuth().resetPassword`,
 * qui pose les jetons exactement comme `login` (voir `lib/auth/auth-context.tsx`).
 * La redirection dans l'application se fait ensuite via
 * `useRedirectIfAuthenticated`, dès que le statut passe à "authenticated" —
 * même mécanisme que login/signup, pas un `router.push` ad hoc ici.
 */

import { useState } from "react";
import Link from "next/link";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Loader2, TriangleAlert } from "lucide-react";

import { AuthCard } from "@/components/auth/auth-card";
import { FormField } from "@/components/form/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError } from "@/lib/api/errors";
import { useAuth } from "@/lib/auth/auth-context";
import { useRedirectIfAuthenticated } from "@/lib/auth/route-guards";

const resetSchema = z
  .object({
    password: z.string().min(8, "8 caractères minimum.").max(72, "72 caractères maximum."),
    confirmPassword: z.string().min(1, "Confirmez le mot de passe."),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: "Les mots de passe ne correspondent pas.",
    path: ["confirmPassword"],
  });
type ResetValues = z.infer<typeof resetSchema>;

export function ResetPasswordForm({ token }: { token: string | null }) {
  useRedirectIfAuthenticated();
  const { resetPassword } = useAuth();
  const [linkError, setLinkError] = useState<string | null>(
    token ? null : "Ce lien de réinitialisation est invalide.",
  );

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetValues>({ resolver: zodResolver(resetSchema) });

  async function onSubmit(values: ResetValues) {
    if (!token) return;
    try {
      await resetPassword({ token, password: values.password });
      // Redirection prise en charge par useRedirectIfAuthenticated ci-dessus.
    } catch (error) {
      if (error instanceof ApiError && error.status === 400) {
        // Jeton invalide/expiré (`AuthService.reset_password`) : un état dédié,
        // pas un toast qui laisserait le formulaire réessayable pour rien.
        setLinkError(error.message);
        return;
      }
      const message =
        error instanceof ApiError ? error.message : "Réinitialisation impossible. Réessayez.";
      toast.error(message);
    }
  }

  if (linkError) {
    return (
      <AuthCard
        title="Lien invalide"
        description="Ce lien de réinitialisation n'est plus valable."
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
          <p className="text-sm text-muted-foreground">{linkError}</p>
          <Button asChild variant="outline" className="mt-1">
            <Link href="/mot-de-passe-oublie">Demander un nouveau lien</Link>
          </Button>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Nouveau mot de passe" description="Choisissez un nouveau mot de passe pour votre compte.">
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <FormField
          id="password"
          label="Nouveau mot de passe"
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

        <FormField
          id="confirmPassword"
          label="Confirmer le mot de passe"
          error={errors.confirmPassword?.message}
        >
          <Input
            id="confirmPassword"
            type="password"
            autoComplete="new-password"
            placeholder="••••••••"
            aria-invalid={Boolean(errors.confirmPassword)}
            disabled={isSubmitting}
            {...register("confirmPassword")}
          />
        </FormField>

        <Button type="submit" className="w-full" size="lg" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : null}
          Réinitialiser le mot de passe
        </Button>
      </form>
    </AuthCard>
  );
}
