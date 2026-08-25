"use client";

/**
 * Boîte de dialogue de saisie d'un mouvement de stock (cahier des charges
 * §7.3) : quatre formulaires distincts sous onglets — Entrée, Sortie,
 * Ajustement, Transfert — plutôt qu'un formulaire unique qui mélangerait des
 * champs sans rapport (fournisseur vs bénéficiaire, comptage vs dépôts
 * multiples). Un mouvement est immuable et additif : on ne corrige jamais un
 * mouvement passé, on en saisit un nouveau (inverse au besoin).
 *
 * L'ajustement affiche systématiquement le stock actuel, le comptage saisi et
 * l'écart avant confirmation (`AlertDialog`) — c'est une correction silencieuse
 * de la quantité enregistrée, la justification et l'écart doivent être vus
 * avant validation, pas découverts après coup.
 */

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { ArrowLeftRight, ArrowRightLeft, Loader2, PackageMinus, PackagePlus, Plus, Scale } from "lucide-react";

import { FormField } from "@/components/form/form-field";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api/errors";
import { MAX_UPLOAD_BYTES, uploadDocument } from "@/lib/api/documents";
import {
  createAdjustmentMovement,
  createEntryMovement,
  createExitMovement,
  createTransferMovement,
  listStockLevels,
} from "@/lib/api/stock";
import type { ArticleVariantOut, DepotOut } from "@/lib/api/types";
import { variantLabel } from "@/lib/stock-format";

export interface MovementDialogProps {
  recordId: string;
  organizationId: string;
  accessToken: string;
  variants: ArticleVariantOut[];
  depots: DepotOut[];
  lotTrackingEnabled: boolean;
  onDone: () => void;
  trigger?: React.ReactNode;
  defaultTab?: "entry" | "exit" | "adjustment" | "transfer";
}

export function MovementDialog({
  recordId,
  organizationId,
  accessToken,
  variants,
  depots,
  lotTrackingEnabled,
  onDone,
  trigger,
  defaultTab = "entry",
}: MovementDialogProps) {
  const [open, setOpen] = useState(false);
  const activeDepots = depots.filter((d) => d.is_active);

  function handleDone() {
    onDone();
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button type="button">
            <Plus className="size-4" />
            Nouveau mouvement
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nouveau mouvement de stock</DialogTitle>
          <DialogDescription>
            Un mouvement est immuable : il ne se modifie jamais, on le corrige par un mouvement inverse (§7.3).
          </DialogDescription>
        </DialogHeader>

        {activeDepots.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
            Aucun dépôt actif. Créez d&apos;abord un dépôt depuis « Dépôts ».
          </p>
        ) : (
          <Tabs defaultValue={defaultTab}>
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="entry">Entrée</TabsTrigger>
              <TabsTrigger value="exit">Sortie</TabsTrigger>
              <TabsTrigger value="adjustment">Ajustement</TabsTrigger>
              <TabsTrigger value="transfer">Transfert</TabsTrigger>
            </TabsList>

            <TabsContent value="entry" className="mt-4">
              <EntryForm
                recordId={recordId}
                organizationId={organizationId}
                accessToken={accessToken}
                variants={variants}
                depots={activeDepots}
                lotTrackingEnabled={lotTrackingEnabled}
                onDone={handleDone}
              />
            </TabsContent>
            <TabsContent value="exit" className="mt-4">
              <ExitForm
                organizationId={organizationId}
                accessToken={accessToken}
                variants={variants}
                depots={activeDepots}
                lotTrackingEnabled={lotTrackingEnabled}
                onDone={handleDone}
              />
            </TabsContent>
            <TabsContent value="adjustment" className="mt-4">
              <AdjustmentForm
                organizationId={organizationId}
                accessToken={accessToken}
                variants={variants}
                depots={activeDepots}
                onDone={handleDone}
              />
            </TabsContent>
            <TabsContent value="transfer" className="mt-4">
              <TransferForm
                organizationId={organizationId}
                accessToken={accessToken}
                variants={variants}
                depots={activeDepots}
                onDone={handleDone}
              />
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}

function VariantSelect({
  variants,
  value,
  onChange,
  id,
}: {
  variants: ArticleVariantOut[];
  value: string;
  onChange: (value: string) => void;
  id: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id} className="w-full">
        <SelectValue placeholder="Choisir une variante" />
      </SelectTrigger>
      <SelectContent>
        {variants.map((variant) => (
          <SelectItem key={variant.id} value={variant.id}>
            {variantLabel(variant)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function DepotSelect({
  depots,
  value,
  onChange,
  id,
  placeholder = "Choisir un dépôt",
}: {
  depots: DepotOut[];
  value: string;
  onChange: (value: string) => void;
  id: string;
  placeholder?: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id} className="w-full">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {depots.map((depot) => (
          <SelectItem key={depot.id} value={depot.id}>
            {depot.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// --- Entrée --------------------------------------------------------------------------

const entrySchema = z.object({
  variant_id: z.string().min(1, "Sélectionnez une variante."),
  depot_id: z.string().min(1, "Sélectionnez un dépôt."),
  quantity: z.number({ message: "Quantité requise." }).positive("Doit être supérieure à zéro."),
  reason: z.string().max(200).optional(),
  supplier: z.string().max(200).optional(),
  cost_amount: z.number().optional(),
  lot_number: z.string().max(80).optional(),
  lot_expiry_date: z.string().optional(),
  note: z.string().max(500).optional(),
});
type EntryValues = z.infer<typeof entrySchema>;

function EntryForm({
  recordId,
  organizationId,
  accessToken,
  variants,
  depots,
  lotTrackingEnabled,
  onDone,
}: {
  recordId: string;
  organizationId: string;
  accessToken: string;
  variants: ArticleVariantOut[];
  depots: DepotOut[];
  lotTrackingEnabled: boolean;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const form = useForm<EntryValues>({
    resolver: zodResolver(entrySchema),
    defaultValues: { variant_id: variants[0]?.id ?? "", depot_id: "", quantity: undefined, note: "" },
  });
  const { control, register, handleSubmit, formState, setError } = form;

  const mutation = useMutation({
    mutationFn: async (values: EntryValues) => {
      if (lotTrackingEnabled && (!values.lot_number?.trim() || !values.lot_expiry_date)) {
        throw new ApiError("Numéro de lot et date de péremption requis pour cet article.", 400);
      }
      let documentId: string | null = null;
      if (file) {
        const uploaded = await uploadDocument(accessToken, organizationId, recordId, file);
        documentId = uploaded.id;
      }
      return createEntryMovement(accessToken, organizationId, {
        variant_id: values.variant_id,
        depot_id: values.depot_id,
        quantity: values.quantity,
        reason: values.reason?.trim() || null,
        supplier: values.supplier?.trim() || null,
        cost_amount: values.cost_amount ?? null,
        lot_number: lotTrackingEnabled ? values.lot_number!.trim() : null,
        lot_expiry_date: lotTrackingEnabled ? values.lot_expiry_date! : null,
        document_id: documentId,
        note: values.note?.trim() || null,
      });
    },
    onSuccess: () => {
      toast.success("Entrée enregistrée.");
      void queryClient.invalidateQueries({ queryKey: ["stock-levels", organizationId] });
      void queryClient.invalidateQueries({ queryKey: ["stock-movements", organizationId] });
      void queryClient.invalidateQueries({ queryKey: ["stock-lots", organizationId] });
      onDone();
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 400 && err.message.includes("lot")) {
        setError("lot_number", { message: err.message });
        return;
      }
      toast.error(err instanceof ApiError ? err.message : "Enregistrement impossible.");
    },
  });

  return (
    <form onSubmit={handleSubmit((v) => mutation.mutate(v))} noValidate className="space-y-3">
      <p className="text-xs text-muted-foreground">Augmente le stock d&apos;un dépôt — achat, retour…</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField id="entry-variant" label="Variante" error={formState.errors.variant_id?.message}>
          <Controller
            control={control}
            name="variant_id"
            render={({ field }) => (
              <VariantSelect id="entry-variant" variants={variants} value={field.value} onChange={field.onChange} />
            )}
          />
        </FormField>
        <FormField id="entry-depot" label="Dépôt" error={formState.errors.depot_id?.message}>
          <Controller
            control={control}
            name="depot_id"
            render={({ field }) => (
              <DepotSelect id="entry-depot" depots={depots} value={field.value} onChange={field.onChange} />
            )}
          />
        </FormField>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField id="entry-quantity" label="Quantité" error={formState.errors.quantity?.message}>
          <Input
            id="entry-quantity"
            type="number"
            min={1}
            {...register("quantity", { setValueAs: (v) => (v === "" ? undefined : Number(v)) })}
          />
        </FormField>
        <FormField id="entry-cost" label="Coût" hint="Facultatif">
          <Input
            id="entry-cost"
            type="number"
            step="0.01"
            min={0}
            {...register("cost_amount", { setValueAs: (v) => (v === "" ? undefined : Number(v)) })}
          />
        </FormField>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField id="entry-reason" label="Motif" hint="Ex. achat, retour">
          <Input id="entry-reason" {...register("reason")} />
        </FormField>
        <FormField id="entry-supplier" label="Fournisseur" hint="Facultatif">
          <Input id="entry-supplier" {...register("supplier")} />
        </FormField>
      </div>
      {lotTrackingEnabled ? (
        <div className="grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-2">
          <FormField id="entry-lot" label="Numéro de lot" error={formState.errors.lot_number?.message}>
            <Input id="entry-lot" {...register("lot_number")} />
          </FormField>
          <FormField id="entry-expiry" label="Date limite" error={formState.errors.lot_expiry_date?.message}>
            <Input id="entry-expiry" type="date" {...register("lot_expiry_date")} />
          </FormField>
          <p className="text-xs text-muted-foreground sm:col-span-2">
            Cet article suit les lots : numéro et date de péremption obligatoires (§7.5).
          </p>
        </div>
      ) : null}
      <FormField id="entry-document" label="Pièce jointe" hint="Facultatif — bon de livraison, facture…">
        <Input
          id="entry-document"
          type="file"
          onChange={(e) => {
            const picked = e.target.files?.[0] ?? null;
            if (picked && picked.size > MAX_UPLOAD_BYTES) {
              toast.error("Fichier trop volumineux (15 Mo maximum).");
              e.target.value = "";
              setFile(null);
              return;
            }
            setFile(picked);
          }}
        />
      </FormField>
      <FormField id="entry-note" label="Note" hint="Facultatif">
        <Textarea id="entry-note" rows={2} {...register("note")} />
      </FormField>
      <div className="flex justify-end">
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <PackagePlus className="size-4" />}
          Enregistrer l&apos;entrée
        </Button>
      </div>
    </form>
  );
}

// --- Sortie --------------------------------------------------------------------------

const exitSchema = z.object({
  variant_id: z.string().min(1, "Sélectionnez une variante."),
  depot_id: z.string().min(1, "Sélectionnez un dépôt."),
  quantity: z.number({ message: "Quantité requise." }).positive("Doit être supérieure à zéro."),
  reason: z.string().max(200).optional(),
  beneficiary: z.string().max(200).optional(),
  cost_amount: z.number().optional(),
  lot_number: z.string().max(80).optional(),
  note: z.string().max(500).optional(),
});
type ExitValues = z.infer<typeof exitSchema>;

function ExitForm({
  organizationId,
  accessToken,
  variants,
  depots,
  lotTrackingEnabled,
  onDone,
}: {
  organizationId: string;
  accessToken: string;
  variants: ArticleVariantOut[];
  depots: DepotOut[];
  lotTrackingEnabled: boolean;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const form = useForm<ExitValues>({
    resolver: zodResolver(exitSchema),
    defaultValues: { variant_id: variants[0]?.id ?? "", depot_id: "", quantity: undefined, note: "" },
  });
  const { control, register, handleSubmit, formState } = form;

  const mutation = useMutation({
    mutationFn: (values: ExitValues) =>
      createExitMovement(accessToken, organizationId, {
        variant_id: values.variant_id,
        depot_id: values.depot_id,
        quantity: values.quantity,
        reason: values.reason?.trim() || null,
        beneficiary: values.beneficiary?.trim() || null,
        cost_amount: values.cost_amount ?? null,
        lot_number: lotTrackingEnabled && values.lot_number?.trim() ? values.lot_number.trim() : null,
        note: values.note?.trim() || null,
      }),
    onSuccess: (movements) => {
      toast.success(
        movements.length > 1
          ? `Sortie enregistrée sur ${movements.length} lots (FIFO).`
          : "Sortie enregistrée.",
      );
      void queryClient.invalidateQueries({ queryKey: ["stock-levels", organizationId] });
      void queryClient.invalidateQueries({ queryKey: ["stock-movements", organizationId] });
      void queryClient.invalidateQueries({ queryKey: ["stock-lots", organizationId] });
      onDone();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Enregistrement impossible."),
  });

  return (
    <form onSubmit={handleSubmit((v) => mutation.mutate(v))} noValidate className="space-y-3">
      <p className="text-xs text-muted-foreground">Diminue le stock d&apos;un dépôt — vente, consommation, perte, casse…</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField id="exit-variant" label="Variante" error={formState.errors.variant_id?.message}>
          <Controller
            control={control}
            name="variant_id"
            render={({ field }) => (
              <VariantSelect id="exit-variant" variants={variants} value={field.value} onChange={field.onChange} />
            )}
          />
        </FormField>
        <FormField id="exit-depot" label="Dépôt" error={formState.errors.depot_id?.message}>
          <Controller
            control={control}
            name="depot_id"
            render={({ field }) => (
              <DepotSelect id="exit-depot" depots={depots} value={field.value} onChange={field.onChange} />
            )}
          />
        </FormField>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField id="exit-quantity" label="Quantité" error={formState.errors.quantity?.message}>
          <Input
            id="exit-quantity"
            type="number"
            min={1}
            {...register("quantity", { setValueAs: (v) => (v === "" ? undefined : Number(v)) })}
          />
        </FormField>
        <FormField id="exit-cost" label="Coût" hint="Facultatif">
          <Input
            id="exit-cost"
            type="number"
            step="0.01"
            min={0}
            {...register("cost_amount", { setValueAs: (v) => (v === "" ? undefined : Number(v)) })}
          />
        </FormField>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField id="exit-reason" label="Motif" hint="Ex. vente, consommation, perte, casse">
          <Input id="exit-reason" {...register("reason")} />
        </FormField>
        <FormField id="exit-beneficiary" label="Bénéficiaire" hint="Facultatif">
          <Input id="exit-beneficiary" {...register("beneficiary")} />
        </FormField>
      </div>
      {lotTrackingEnabled ? (
        <FormField
          id="exit-lot"
          label="Numéro de lot"
          hint="Facultatif — laissez vide pour consommer au plus ancien (FIFO)."
        >
          <Input id="exit-lot" {...register("lot_number")} />
        </FormField>
      ) : null}
      <FormField id="exit-note" label="Note" hint="Facultatif">
        <Textarea id="exit-note" rows={2} {...register("note")} />
      </FormField>
      <div className="flex justify-end">
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <PackageMinus className="size-4" />}
          Enregistrer la sortie
        </Button>
      </div>
    </form>
  );
}

// --- Ajustement ------------------------------------------------------------------------

const adjustmentSchema = z.object({
  variant_id: z.string().min(1, "Sélectionnez une variante."),
  depot_id: z.string().min(1, "Sélectionnez un dépôt."),
  counted_quantity: z.number({ message: "Quantité comptée requise." }).min(0, "Ne peut pas être négative."),
  note: z.string().min(1, "La justification est obligatoire."),
});
type AdjustmentValues = z.infer<typeof adjustmentSchema>;

function AdjustmentForm({
  organizationId,
  accessToken,
  variants,
  depots,
  onDone,
}: {
  organizationId: string;
  accessToken: string;
  variants: ArticleVariantOut[];
  depots: DepotOut[];
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState<AdjustmentValues | null>(null);
  const form = useForm<AdjustmentValues>({
    resolver: zodResolver(adjustmentSchema),
    defaultValues: { variant_id: variants[0]?.id ?? "", depot_id: "", counted_quantity: undefined, note: "" },
  });
  const { control, register, handleSubmit, formState } = form;
  const variantId = useWatch({ control, name: "variant_id" });
  const depotId = useWatch({ control, name: "depot_id" });

  const currentLevelQuery = useQuery({
    queryKey: ["stock-level-pair", organizationId, variantId, depotId],
    queryFn: () => listStockLevels(accessToken, organizationId, { variantId, depotId }),
    enabled: Boolean(confirming && variantId && depotId),
    // Un ajustement corrige silencieusement la quantité enregistrée : la
    // quantité "Actuel" affichée avant confirmation doit toujours être
    // fraîche, jamais celle mise en cache jusqu'à 30 s plus tôt (défaut
    // global, lib/api/query-provider.tsx) — sans quoi rouvrir la
    // confirmation après une annulation pourrait montrer un écart obsolète.
    staleTime: 0,
  });
  const currentQuantity = currentLevelQuery.data?.[0]?.quantity ?? 0;

  const mutation = useMutation({
    mutationFn: (values: AdjustmentValues) =>
      createAdjustmentMovement(accessToken, organizationId, {
        variant_id: values.variant_id,
        depot_id: values.depot_id,
        counted_quantity: values.counted_quantity,
        note: values.note.trim(),
      }),
    onSuccess: () => {
      toast.success("Ajustement enregistré.");
      void queryClient.invalidateQueries({ queryKey: ["stock-levels", organizationId] });
      void queryClient.invalidateQueries({ queryKey: ["stock-movements", organizationId] });
      setConfirming(null);
      onDone();
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Enregistrement impossible.");
      setConfirming(null);
    },
  });

  const selectedVariant = variants.find((v) => v.id === confirming?.variant_id);
  const selectedDepot = depots.find((d) => d.id === confirming?.depot_id);
  const delta = confirming ? confirming.counted_quantity - currentQuantity : 0;

  return (
    <>
      <form onSubmit={handleSubmit((v) => setConfirming(v))} noValidate className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Aligne le stock enregistré sur un comptage réel — l&apos;écart est calculé automatiquement.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField id="adj-variant" label="Variante" error={formState.errors.variant_id?.message}>
            <Controller
              control={control}
              name="variant_id"
              render={({ field }) => (
                <VariantSelect id="adj-variant" variants={variants} value={field.value} onChange={field.onChange} />
              )}
            />
          </FormField>
          <FormField id="adj-depot" label="Dépôt" error={formState.errors.depot_id?.message}>
            <Controller
              control={control}
              name="depot_id"
              render={({ field }) => (
                <DepotSelect id="adj-depot" depots={depots} value={field.value} onChange={field.onChange} />
              )}
            />
          </FormField>
        </div>
        <FormField id="adj-counted" label="Quantité comptée" error={formState.errors.counted_quantity?.message}>
          <Input
            id="adj-counted"
            type="number"
            min={0}
            {...register("counted_quantity", { setValueAs: (v) => (v === "" ? undefined : Number(v)) })}
          />
        </FormField>
        <FormField id="adj-note" label="Justification" error={formState.errors.note?.message} hint="Obligatoire.">
          <Textarea id="adj-note" rows={2} {...register("note")} placeholder="Ex. comptage physique du 12/03…" />
        </FormField>
        <div className="flex justify-end">
          <Button type="submit">
            <Scale className="size-4" />
            Vérifier l&apos;écart
          </Button>
        </div>
      </form>

      <AlertDialog open={Boolean(confirming)} onOpenChange={(next) => !next && setConfirming(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmer l&apos;ajustement ?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-left">
                <p>
                  {selectedVariant ? variantLabel(selectedVariant) : ""} — {selectedDepot?.name}
                </p>
                <div className="grid grid-cols-3 gap-2 rounded-lg border border-border bg-muted/40 p-3 text-center">
                  <div>
                    <p className="text-xs text-muted-foreground">Actuel</p>
                    <p className="font-heading text-lg font-medium text-foreground">
                      {currentLevelQuery.isLoading ? "…" : currentQuantity}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Compté</p>
                    <p className="font-heading text-lg font-medium text-foreground">{confirming?.counted_quantity}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Écart</p>
                    <p
                      className={`font-heading text-lg font-medium ${delta === 0 ? "text-foreground" : delta > 0 ? "text-success" : "text-destructive"}`}
                    >
                      {delta > 0 ? `+${delta}` : delta}
                    </p>
                  </div>
                </div>
                <p className="text-muted-foreground">Justification : « {confirming?.note} »</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={mutation.isPending}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              disabled={mutation.isPending || currentLevelQuery.isLoading}
              onClick={() => confirming && mutation.mutate(confirming)}
            >
              {mutation.isPending ? <Loader2 className="size-3.5 animate-spin" /> : null}
              Confirmer l&apos;ajustement
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// --- Transfert -----------------------------------------------------------------------

const transferSchema = z
  .object({
    variant_id: z.string().min(1, "Sélectionnez une variante."),
    from_depot_id: z.string().min(1, "Sélectionnez un dépôt d'origine."),
    to_depot_id: z.string().min(1, "Sélectionnez un dépôt de destination."),
    quantity: z.number({ message: "Quantité requise." }).positive("Doit être supérieure à zéro."),
    note: z.string().max(500).optional(),
  })
  .refine((v) => v.from_depot_id !== v.to_depot_id, {
    message: "Les dépôts d'origine et de destination doivent être différents.",
    path: ["to_depot_id"],
  });
type TransferValues = z.infer<typeof transferSchema>;

function TransferForm({
  organizationId,
  accessToken,
  variants,
  depots,
  onDone,
}: {
  organizationId: string;
  accessToken: string;
  variants: ArticleVariantOut[];
  depots: DepotOut[];
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const form = useForm<TransferValues>({
    resolver: zodResolver(transferSchema),
    defaultValues: {
      variant_id: variants[0]?.id ?? "",
      from_depot_id: "",
      to_depot_id: "",
      quantity: undefined,
      note: "",
    },
  });
  const { control, register, handleSubmit, formState } = form;

  const mutation = useMutation({
    mutationFn: (values: TransferValues) =>
      createTransferMovement(accessToken, organizationId, {
        variant_id: values.variant_id,
        from_depot_id: values.from_depot_id,
        to_depot_id: values.to_depot_id,
        quantity: values.quantity,
        note: values.note?.trim() || null,
      }),
    onSuccess: () => {
      toast.success("Transfert enregistré.");
      void queryClient.invalidateQueries({ queryKey: ["stock-levels", organizationId] });
      void queryClient.invalidateQueries({ queryKey: ["stock-movements", organizationId] });
      onDone();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Enregistrement impossible."),
  });

  return (
    <form onSubmit={handleSubmit((v) => mutation.mutate(v))} noValidate className="space-y-3">
      <p className="text-xs text-muted-foreground">Déplace une quantité d&apos;un dépôt vers un autre, sans changer le total.</p>
      <FormField id="transfer-variant" label="Variante" error={formState.errors.variant_id?.message}>
        <Controller
          control={control}
          name="variant_id"
          render={({ field }) => (
            <VariantSelect id="transfer-variant" variants={variants} value={field.value} onChange={field.onChange} />
          )}
        />
      </FormField>
      <div className="grid items-end gap-3 sm:grid-cols-[1fr_auto_1fr]">
        <FormField id="transfer-from" label="Dépôt d'origine" error={formState.errors.from_depot_id?.message}>
          <Controller
            control={control}
            name="from_depot_id"
            render={({ field }) => (
              <DepotSelect id="transfer-from" depots={depots} value={field.value} onChange={field.onChange} />
            )}
          />
        </FormField>
        <ArrowRightLeft className="mb-2 hidden size-4 shrink-0 text-muted-foreground sm:block" />
        <FormField id="transfer-to" label="Dépôt de destination" error={formState.errors.to_depot_id?.message}>
          <Controller
            control={control}
            name="to_depot_id"
            render={({ field }) => (
              <DepotSelect id="transfer-to" depots={depots} value={field.value} onChange={field.onChange} />
            )}
          />
        </FormField>
      </div>
      <FormField id="transfer-quantity" label="Quantité" error={formState.errors.quantity?.message}>
        <Input
          id="transfer-quantity"
          type="number"
          min={1}
          {...register("quantity", { setValueAs: (v) => (v === "" ? undefined : Number(v)) })}
        />
      </FormField>
      <FormField id="transfer-note" label="Note" hint="Facultatif">
        <Textarea id="transfer-note" rows={2} {...register("note")} />
      </FormField>
      <div className="flex justify-end">
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <ArrowLeftRight className="size-4" />}
          Enregistrer le transfert
        </Button>
      </div>
    </form>
  );
}
