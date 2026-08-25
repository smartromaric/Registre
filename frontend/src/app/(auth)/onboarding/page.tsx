"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Loader2, Sparkles } from "lucide-react";

import { AuthCard } from "@/components/auth/auth-card";
import { FormField } from "@/components/form/form-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ApiError } from "@/lib/api/errors";
import { useAuth } from "@/lib/auth/auth-context";
import { useRequireOnboarding } from "@/lib/auth/route-guards";
import { COUNTRIES, currencyForCountry } from "@/lib/countries";
import { SECTOR_SUGGESTIONS } from "@/lib/sectors";

// Contraintes alignées sur backend/app/schemas/organization.py:OrganizationCreate.
const onboardingSchema = z.object({
  name: z.string().min(1, "Le nom de l'entreprise est requis.").max(200, "200 caractères maximum."),
  country_code: z.string().length(2, "Sélectionnez un pays."),
  sector: z.string().max(120, "120 caractères maximum.").optional(),
});

type OnboardingValues = z.infer<typeof onboardingSchema>;

export default function OnboardingPage() {
  useRequireOnboarding();
  const { user, completeOnboarding, logout } = useAuth();

  const {
    control,
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<OnboardingValues>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: { name: "", country_code: "", sector: "" },
  });

  // useWatch plutôt que la fonction `watch()` du formulaire : cette dernière
  // n'est pas mémoïsable, ce qui empêche le compilateur React d'optimiser le
  // composant (voir l'avertissement react-hooks/incompatible-library).
  const countryCode = useWatch({ control, name: "country_code" });
  const previewCurrency = countryCode ? currencyForCountry(countryCode) : undefined;

  async function onSubmit(values: OnboardingValues) {
    try {
      await completeOnboarding({
        name: values.name,
        country_code: values.country_code,
        sector: values.sector?.trim() ? values.sector.trim() : null,
      });
      toast.success("Organisation créée. Votre essai de 14 jours démarre.");
    } catch (error) {
      const message =
        error instanceof ApiError ? error.message : "Création de l'organisation impossible.";
      toast.error(message);
    }
  }

  return (
    <AuthCard
      title="Parlez-nous de votre entreprise"
      description={
        user
          ? `Bienvenue ${user.full_name.split(" ")[0]}. Trois informations suffisent pour démarrer.`
          : "Trois informations suffisent pour démarrer."
      }
      footer={
        <button
          type="button"
          onClick={() => void logout()}
          className="text-muted-foreground underline-offset-4 hover:underline"
        >
          Utiliser un autre compte
        </button>
      }
    >
      <Badge className="border-none bg-gold text-gold-foreground">
        <Sparkles className="size-3" />
        Essai gratuit de 14 jours
      </Badge>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <FormField id="name" label="Nom de l'entreprise" error={errors.name?.message}>
          <Input
            id="name"
            autoComplete="organization"
            placeholder="Transports Awa SARL"
            aria-invalid={Boolean(errors.name)}
            disabled={isSubmitting}
            {...register("name")}
          />
        </FormField>

        <FormField
          id="country_code"
          label="Pays"
          error={errors.country_code?.message}
          hint={previewCurrency ? `Devise de l'organisation : ${previewCurrency}` : undefined}
        >
          <Controller
            control={control}
            name="country_code"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange} disabled={isSubmitting}>
                <SelectTrigger id="country_code" className="w-full" aria-invalid={Boolean(errors.country_code)}>
                  <SelectValue placeholder="Sélectionnez un pays" />
                </SelectTrigger>
                <SelectContent>
                  {COUNTRIES.map((country) => (
                    <SelectItem key={country.code} value={country.code}>
                      {country.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </FormField>

        <FormField
          id="sector"
          label="Secteur d'activité"
          error={errors.sector?.message}
          hint="Facultatif — nous aide à proposer les bons modèles de fiche."
        >
          <Input
            id="sector"
            list="sector-suggestions"
            placeholder="Transport et logistique"
            aria-invalid={Boolean(errors.sector)}
            disabled={isSubmitting}
            {...register("sector")}
          />
          <datalist id="sector-suggestions">
            {SECTOR_SUGGESTIONS.map((sector) => (
              <option key={sector} value={sector} />
            ))}
          </datalist>
        </FormField>

        <Button type="submit" className="w-full" size="lg" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : null}
          Créer mon organisation
        </Button>
      </form>
    </AuthCard>
  );
}
