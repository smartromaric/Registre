"use client";

/**
 * Mot de passe oublié (cahier des charges §4.4 raffinement) : formulaire e-mail
 * puis état de succès générique, quel que soit le résultat réel côté backend —
 * `POST /auth/password/forgot` renvoie toujours 204, précisément pour ne
 * jamais révéler si un compte existe pour cette adresse (voir
 * `AuthService.request_password_reset`). L'UI suit la même discipline : ne
 * jamais afficher "aucun compte trouvé".
 */

import { useState } from "react";
import Link from "next/link";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Loader2, MailCheck } from "lucide-react";

import { AuthCard } from "@/components/auth/auth-card";
import { FormField } from "@/components/form/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { forgotPassword } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/errors";
import { useRedirectIfAuthenticated } from "@/lib/auth/route-guards";

const forgotSchema = z.object({
  email: z.email("Adresse e-mail invalide."),
});
type ForgotValues = z.infer<typeof forgotSchema>;

export default function ForgotPasswordPage() {
  useRedirectIfAuthenticated();
  const [sentTo, setSentTo] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotValues>({ resolver: zodResolver(forgotSchema) });

  async function onSubmit(values: ForgotValues) {
    try {
      await forgotPassword(values.email.trim().toLowerCase());
      setSentTo(values.email.trim());
    } catch (error) {
      // Seule une vraie panne (réseau, serveur injoignable) atterrit ici — le
      // backend renvoie 204 dans tous les autres cas, jamais un 404.
      const message =
        error instanceof ApiError ? error.message : "Impossible d'envoyer le lien. Réessayez.";
      toast.error(message);
    }
  }

  if (sentTo) {
    return (
      <AuthCard
        title="Vérifiez vos e-mails"
        description="Un lien de réinitialisation vient d'être envoyé si ce compte existe."
        footer={
          <Link href="/login" className="font-medium text-primary hover:underline">
            Retour à la connexion
          </Link>
        }
      >
        <div className="flex flex-col items-center gap-3 py-2 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <MailCheck className="size-6" />
          </span>
          <p className="text-sm text-muted-foreground">
            Si un compte existe pour <strong className="text-foreground">{sentTo}</strong>, un e-mail contenant un
            lien de réinitialisation vient d&apos;être envoyé. Pensez à vérifier vos courriers indésirables — le
            lien reste valable un temps limité.
          </p>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Mot de passe oublié ?"
      description="Indiquez votre adresse e-mail : nous vous envoyons un lien pour en choisir un nouveau."
      footer={
        <>
          Vous vous en souvenez finalement ?{" "}
          <Link href="/login" className="font-medium text-primary hover:underline">
            Se connecter
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <FormField id="email" label="Adresse e-mail" error={errors.email?.message}>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="vous@entreprise.com"
            aria-invalid={Boolean(errors.email)}
            disabled={isSubmitting}
            {...register("email")}
          />
        </FormField>

        <Button type="submit" className="w-full" size="lg" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : null}
          Envoyer le lien
        </Button>
      </form>
    </AuthCard>
  );
}
