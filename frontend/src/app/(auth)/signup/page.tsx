"use client";

import { useState } from "react";
import Link from "next/link";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Loader2 } from "lucide-react";

import { AuthCard } from "@/components/auth/auth-card";
import { GoogleSignInButton } from "@/components/auth/google-signin-button";
import { FormField } from "@/components/form/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError } from "@/lib/api/errors";
import { useAuth } from "@/lib/auth/auth-context";
import { useRedirectIfAuthenticated } from "@/lib/auth/route-guards";

// Contraintes alignées sur backend/app/schemas/auth.py:SignupRequest.
const signupSchema = z.object({
  full_name: z.string().min(1, "Le nom complet est requis.").max(200, "200 caractères maximum."),
  email: z.email("Adresse e-mail invalide."),
  password: z
    .string()
    .min(8, "8 caractères minimum.")
    .max(72, "72 caractères maximum (limite technique bcrypt)."),
});

type SignupValues = z.infer<typeof signupSchema>;

export default function SignupPage() {
  useRedirectIfAuthenticated();
  const { signup, loginWithGoogle } = useAuth();
  const [googleBusy, setGoogleBusy] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignupValues>({ resolver: zodResolver(signupSchema) });

  const busy = isSubmitting || googleBusy;

  async function onSubmit(values: SignupValues) {
    try {
      await signup(values);
      // La redirection vers /onboarding se fait via useRedirectIfAuthenticated
      // dès que la liste (vide) des organisations est connue.
    } catch (error) {
      const message =
        error instanceof ApiError ? error.message : "Inscription impossible. Réessayez.";
      toast.error(message);
    }
  }

  async function onGoogleCredential(idToken: string) {
    setGoogleBusy(true);
    try {
      await loginWithGoogle(idToken);
    } catch (error) {
      const message =
        error instanceof ApiError ? error.message : "Inscription Google impossible. Réessayez.";
      toast.error(message);
    } finally {
      setGoogleBusy(false);
    }
  }

  return (
    <AuthCard
      title="Créer votre espace"
      description="Un essai de 14 jours démarre dès la création de votre organisation."
      footer={
        <>
          Déjà un compte ?{" "}
          <Link href="/login" className="font-medium text-primary hover:underline">
            Se connecter
          </Link>
        </>
      }
    >
      <GoogleSignInButton mode="signup" onCredential={onGoogleCredential} disabled={busy} />

      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        ou par e-mail
        <span className="h-px flex-1 bg-border" />
      </div>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <FormField id="full_name" label="Nom complet" error={errors.full_name?.message}>
          <Input
            id="full_name"
            autoComplete="name"
            placeholder="Awa Ngo"
            aria-invalid={Boolean(errors.full_name)}
            disabled={busy}
            {...register("full_name")}
          />
        </FormField>

        <FormField id="email" label="Adresse e-mail" error={errors.email?.message}>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="vous@entreprise.com"
            aria-invalid={Boolean(errors.email)}
            disabled={busy}
            {...register("email")}
          />
        </FormField>

        <FormField
          id="password"
          label="Mot de passe"
          error={errors.password?.message}
          hint={errors.password ? undefined : "8 caractères minimum."}
        >
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            placeholder="••••••••"
            aria-invalid={Boolean(errors.password)}
            disabled={busy}
            {...register("password")}
          />
        </FormField>

        <Button type="submit" className="w-full" size="lg" disabled={busy}>
          {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : null}
          Créer mon compte
        </Button>
      </form>
    </AuthCard>
  );
}
