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

const loginSchema = z.object({
  email: z.email("Adresse e-mail invalide."),
  password: z.string().min(1, "Mot de passe requis."),
});

type LoginValues = z.infer<typeof loginSchema>;

export default function LoginPage() {
  useRedirectIfAuthenticated();
  const { login, loginWithGoogle } = useAuth();
  const [googleBusy, setGoogleBusy] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({ resolver: zodResolver(loginSchema) });

  const busy = isSubmitting || googleBusy;

  async function onSubmit(values: LoginValues) {
    try {
      await login(values);
    } catch (error) {
      const message =
        error instanceof ApiError ? error.message : "Connexion impossible. Réessayez.";
      toast.error(message);
    }
  }

  async function onGoogleCredential(idToken: string) {
    setGoogleBusy(true);
    try {
      await loginWithGoogle(idToken);
    } catch (error) {
      const message =
        error instanceof ApiError ? error.message : "Connexion Google impossible. Réessayez.";
      toast.error(message);
    } finally {
      setGoogleBusy(false);
    }
  }

  return (
    <AuthCard
      title="Bon retour"
      description="Connectez-vous à votre espace Registre."
      footer={
        <>
          Pas encore de compte ?{" "}
          <Link href="/signup" className="font-medium text-primary hover:underline">
            Créer un compte
          </Link>
        </>
      }
    >
      <GoogleSignInButton mode="signin" onCredential={onGoogleCredential} disabled={busy} />

      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        ou par e-mail
        <span className="h-px flex-1 bg-border" />
      </div>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
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

        <FormField id="password" label="Mot de passe" error={errors.password?.message}>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            placeholder="••••••••"
            aria-invalid={Boolean(errors.password)}
            disabled={busy}
            {...register("password")}
          />
        </FormField>

        <Button type="submit" className="w-full" size="lg" disabled={busy}>
          {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : null}
          Se connecter
        </Button>
      </form>
    </AuthCard>
  );
}
