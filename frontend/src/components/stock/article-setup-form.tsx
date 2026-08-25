"use client";

/**
 * Première configuration d'un article de stock (cahier des charges §7.1) :
 * affichée quand `GET .../records/{id}/article` répond 404 — la fiche existe
 * (nature `stock_item`) mais n'a pas encore d'unité, de prix, ni de variantes.
 * Ne construit qu'un seul appel `POST .../article-config` (voir
 * `lib/api/stock.ts:configureArticle`), avec au plus deux attributs de
 * déclinaison (ex. Format, Taille) — au-delà, le backend refuse (422).
 */

import { useMutation } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Loader2, Package, Plus, Trash2 } from "lucide-react";

import { FormField } from "@/components/form/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ApiError } from "@/lib/api/errors";
import { configureArticle } from "@/lib/api/stock";
import type { ArticleConfigCreate, ArticleWithVariantsOut, VariantInput } from "@/lib/api/types";

const setupSchema = z.object({
  unit: z.string().max(30, "30 caractères maximum.").optional(),
  purchase_price: z.number().optional(),
  sale_price: z.number().optional(),
  lot_tracking_enabled: z.boolean(),
  is_consigned: z.boolean(),
  deposit_unit_amount: z.number().optional(),
  attribute_label_1: z.string().max(40, "40 caractères maximum.").optional(),
  attribute_label_2: z.string().max(40, "40 caractères maximum.").optional(),
  variants: z.array(
    z.object({
      value1: z.string().optional(),
      value2: z.string().optional(),
      label: z.string().optional(),
      threshold: z.number().optional(),
    }),
  ),
});

type SetupValues = z.infer<typeof setupSchema>;

const emptyVariantRow = { value1: "", value2: "", label: "", threshold: undefined };

const defaultValues: SetupValues = {
  unit: "",
  purchase_price: undefined,
  sale_price: undefined,
  lot_tracking_enabled: false,
  is_consigned: false,
  deposit_unit_amount: undefined,
  attribute_label_1: "",
  attribute_label_2: "",
  variants: [emptyVariantRow],
};

export interface ArticleSetupFormProps {
  recordId: string;
  organizationId: string;
  accessToken: string;
  onConfigured: (article: ArticleWithVariantsOut) => void;
}

export function ArticleSetupForm({ recordId, organizationId, accessToken, onConfigured }: ArticleSetupFormProps) {
  const form = useForm<SetupValues>({ resolver: zodResolver(setupSchema), defaultValues });
  const { control, register, handleSubmit, setError, formState } = form;
  const variantsArray = useFieldArray({ control, name: "variants" });
  const isConsigned = useWatch({ control, name: "is_consigned" });
  const label1 = useWatch({ control, name: "attribute_label_1" });
  const label2 = useWatch({ control, name: "attribute_label_2" });
  // L'attribut 2 n'a de sens que si l'attribut 1 est déjà renseigné — sinon la
  // colonne "valeur 2" saisie par l'utilisateur se retrouverait associée au
  // mauvais libellé une fois envoyée (voir `onValid` : `labels` ignore aussi
  // l'attribut 2 tant que le 1 est vide).
  const declined = Boolean(label1?.trim());
  const secondColumnEnabled = declined && Boolean(label2?.trim());

  const mutation = useMutation({
    mutationFn: (payload: ArticleConfigCreate) => configureArticle(accessToken, organizationId, recordId, payload),
    onSuccess: (article) => {
      toast.success("Article configuré — le suivi de stock est actif.");
      onConfigured(article);
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Configuration de l'article impossible.");
    },
  });

  function onValid(values: SetupValues) {
    const label1Trimmed = values.attribute_label_1?.trim();
    const label2Trimmed = values.attribute_label_2?.trim();
    // Même règle que `secondColumnEnabled` ci-dessus : l'attribut 2 est ignoré
    // si l'attribut 1 est vide, pour ne jamais décaler les valeurs saisies.
    const labels = label1Trimmed ? [label1Trimmed, ...(label2Trimmed ? [label2Trimmed] : [])] : [];

    let variantInputs: VariantInput[];
    if (labels.length === 0) {
      const row = values.variants[0];
      variantInputs = [
        { attributes: null, label: row?.label?.trim() || null, default_threshold: row?.threshold ?? null },
      ];
    } else {
      variantInputs = values.variants
        .filter((row) => Boolean(row.value1?.trim()) && (labels.length < 2 || Boolean(row.value2?.trim())))
        .map((row) => {
          const attributes: Record<string, string> = { [labels[0]]: row.value1!.trim() };
          if (labels[1]) attributes[labels[1]] = row.value2!.trim();
          return { attributes, label: row.label?.trim() || null, default_threshold: row.threshold ?? null };
        });
      if (variantInputs.length === 0) {
        setError("variants", {
          message: `Ajoutez au moins une variante avec une valeur pour ${labels.length > 1 ? "chaque attribut" : `« ${labels[0]} »`}.`,
        });
        return;
      }
    }

    mutation.mutate({
      unit: values.unit?.trim() || null,
      purchase_price: values.purchase_price ?? null,
      sale_price: values.sale_price ?? null,
      variant_attribute_labels: labels.length > 0 ? labels : null,
      lot_tracking_enabled: values.lot_tracking_enabled,
      is_consigned: values.is_consigned,
      deposit_unit_amount: values.is_consigned ? (values.deposit_unit_amount ?? null) : null,
      variants: variantInputs,
    });
  }

  return (
    <div className="space-y-4 rounded-xl border border-dashed border-border bg-muted/30 p-5">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Package className="size-5" />
        </span>
        <div>
          <h2 className="font-heading text-lg font-medium text-foreground">Configurer le suivi de stock</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Cette fiche n&apos;a pas encore d&apos;unité, de prix ni de variantes de stock. Réglez-les une première
            fois — vous pourrez ajouter des variantes et ajuster les seuils plus tard (§7.1).
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onValid)} noValidate className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <FormField id="art-unit" label="Unité" hint="Ex. bouteille, pièce, kg…">
            <Input id="art-unit" placeholder="pièce" {...register("unit")} />
          </FormField>
          <FormField id="art-purchase" label="Prix d'achat" hint="Facultatif">
            <Input
              id="art-purchase"
              type="number"
              step="0.01"
              min={0}
              {...register("purchase_price", { setValueAs: (v) => (v === "" ? undefined : Number(v)) })}
            />
          </FormField>
          <FormField id="art-sale" label="Prix de vente" hint="Facultatif">
            <Input
              id="art-sale"
              type="number"
              step="0.01"
              min={0}
              {...register("sale_price", { setValueAs: (v) => (v === "" ? undefined : Number(v)) })}
            />
          </FormField>
        </div>

        <div className="grid gap-3 rounded-lg border border-border bg-card p-3.5 sm:grid-cols-2">
          <label className="flex items-start justify-between gap-3">
            <span>
              <span className="block text-sm font-medium text-foreground">Suivi de lots et péremption</span>
              <span className="block text-xs text-muted-foreground">
                Chaque entrée demandera un numéro de lot et une date limite ; les sorties consomment au plus ancien (§7.5).
              </span>
            </span>
            <Controller
              control={control}
              name="lot_tracking_enabled"
              render={({ field }) => <Switch checked={field.value} onCheckedChange={field.onChange} />}
            />
          </label>
          <label className="flex items-start justify-between gap-3">
            <span>
              <span className="block text-sm font-medium text-foreground">Article consigné</span>
              <span className="block text-xs text-muted-foreground">
                Suivi des bouteilles pleines, vides et en circulation chez les clients (§7.6).
              </span>
            </span>
            <Controller
              control={control}
              name="is_consigned"
              render={({ field }) => <Switch checked={field.value} onCheckedChange={field.onChange} />}
            />
          </label>
        </div>

        {isConsigned ? (
          <FormField id="art-deposit" label="Montant de consigne unitaire" hint="Facultatif — par bouteille/unité.">
            <Input
              id="art-deposit"
              type="number"
              step="0.01"
              min={0}
              className="max-w-52"
              {...register("deposit_unit_amount", { setValueAs: (v) => (v === "" ? undefined : Number(v)) })}
            />
          </FormField>
        ) : null}

        <div className="space-y-3">
          <div>
            <p className="text-sm font-medium text-foreground">Décliner en variantes</p>
            <p className="text-xs text-muted-foreground">
              Jusqu&apos;à deux attributs (ex. Format, Taille). Laissez vide pour un article non décliné.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField id="art-attr1" label="Attribut 1" hint="Ex. Format">
              <Input id="art-attr1" placeholder="Format" {...register("attribute_label_1")} />
            </FormField>
            <FormField
              id="art-attr2"
              label="Attribut 2"
              hint={declined ? "Facultatif — ex. Couleur" : "Renseignez d'abord l'attribut 1"}
            >
              <Input id="art-attr2" placeholder="Couleur" disabled={!declined} {...register("attribute_label_2")} />
            </FormField>
          </div>

          <div className="space-y-2">
            {variantsArray.fields.map((row, index) => (
              <div key={row.id} className="flex flex-wrap items-end gap-2 rounded-lg border border-border p-2.5">
                {declined ? (
                  <>
                    <FormField id={`variant-${index}-value1`} label={label1?.trim() || "Attribut 1"} className="w-32">
                      <Input id={`variant-${index}-value1`} {...register(`variants.${index}.value1` as const)} />
                    </FormField>
                    {secondColumnEnabled ? (
                      <FormField id={`variant-${index}-value2`} label={label2?.trim() || "Attribut 2"} className="w-32">
                        <Input id={`variant-${index}-value2`} {...register(`variants.${index}.value2` as const)} />
                      </FormField>
                    ) : null}
                  </>
                ) : null}
                <FormField id={`variant-${index}-label`} label="Libellé" hint="Facultatif" className="w-40 flex-1">
                  <Input
                    id={`variant-${index}-label`}
                    placeholder={declined ? "Auto si vide" : "Ex. Standard"}
                    {...register(`variants.${index}.label` as const)}
                  />
                </FormField>
                <FormField id={`variant-${index}-threshold`} label="Seuil d'alerte" hint="Facultatif" className="w-28">
                  <Input
                    id={`variant-${index}-threshold`}
                    type="number"
                    min={0}
                    {...register(`variants.${index}.threshold` as const, {
                      setValueAs: (v) => (v === "" ? undefined : Number(v)),
                    })}
                  />
                </FormField>
                {declined && variantsArray.fields.length > 1 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Retirer la variante"
                    onClick={() => variantsArray.remove(index)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
          {formState.errors.variants?.message ? (
            <p className="text-sm text-destructive">{formState.errors.variants.message}</p>
          ) : null}
          {declined ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => variantsArray.append(emptyVariantRow)}
            >
              <Plus className="size-3.5" />
              Ajouter une variante
            </Button>
          ) : null}
        </div>

        <div className="flex justify-end">
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            Activer le suivi de stock
          </Button>
        </div>
      </form>
    </div>
  );
}
