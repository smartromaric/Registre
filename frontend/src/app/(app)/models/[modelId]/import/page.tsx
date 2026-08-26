"use client";

/**
 * Import initial d'un fichier tableur (cahier des charges §9, §18.1 — Awa dépose
 * son fichier Excel et confirme que « Immat » va vers Immatriculation).
 *
 * Deux temps, comme le demande le §9 : correspondance des colonnes, puis aperçu
 * avant validation. Trois règles de conduite tenues par cet écran :
 *
 * 1. Aucun compte n'est calculé ici. « N lignes valides », « N en échec » et le
 *    détail des erreurs viennent tous de la réponse du backend sur le fichier
 *    réellement téléversé. Corriger une colonne relance l'aperçu côté serveur
 *    plutôt que de deviner localement l'effet du changement.
 * 2. Un import partiel se dit partiel. Le backend crée ce qui est valide et
 *    rapporte le reste (jamais un tout-ou-rien) : l'écran affiche donc les deux
 *    nombres, et les lignes refusées avec leur motif champ par champ.
 * 3. Ce qui n'a pas été lu est annoncé : pour un classeur, seule la première
 *    feuille est importée — les autres sont nommées à l'écran.
 *
 * Limite connue, non masquée : §18.1 raconte qu'Awa corrige à l'écran les trois
 * lignes aux dates illisibles avant de valider. Cet écran ne fait pas d'édition
 * cellule par cellule — il désigne précisément les lignes fautives et leur motif,
 * à corriger dans le fichier source puis à redéposer.
 */

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  ShieldAlert,
  TriangleAlert,
  Upload,
} from "lucide-react";

import { EmptyState } from "@/components/state-views";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ApiError } from "@/lib/api/errors";
import { getModelDefinition } from "@/lib/api/model-definitions";
import { commitImport, previewImport } from "@/lib/api/records";
import type {
  FieldDefinitionOut,
  ImportCommitResult,
  ImportMappingSuggestion,
  ImportRowError,
} from "@/lib/api/types";
import { useAuth } from "@/lib/auth/auth-context";

/** Radix interdit une `SelectItem` de valeur vide : sentinelle pour « colonne non importée ». */
const IGNORE = "__ignore__";

/** `sample_errors[].row` est l'index 0-based de la ligne de données ; +2 pour
 * retrouver le numéro de ligne du tableur (ligne 1 = en-têtes). */
function sourceLineNumber(row: number): number {
  return row + 2;
}

function plural(count: number, singular: string, plural_: string): string {
  return count === 1 ? singular : plural_;
}

function RowErrorTable({
  errors,
  fields,
  totalFailed,
}: {
  errors: ImportRowError[];
  fields: FieldDefinitionOut[];
  totalFailed: number;
}) {
  const labelOf = (key: string) =>
    key === "_" ? "Ligne entière" : (fields.find((f) => f.key === key)?.label ?? key);

  return (
    <div className="space-y-2">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-28">Ligne</TableHead>
            <TableHead>Motif du refus</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {errors.map((rowError) => (
            <TableRow key={rowError.row}>
              <TableCell className="align-top font-medium text-foreground">
                Ligne {sourceLineNumber(rowError.row)}
              </TableCell>
              <TableCell className="space-y-0.5">
                {Object.entries(rowError.errors).map(([fieldKey, message]) => (
                  <p key={fieldKey} className="text-sm">
                    <span className="font-medium text-foreground">{labelOf(fieldKey)}</span>
                    <span className="text-muted-foreground"> — {message}</span>
                  </p>
                ))}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <p className="text-xs text-muted-foreground">
        {totalFailed > errors.length
          ? `${errors.length} première${plural(errors.length, "", "s")} ligne${plural(errors.length, "", "s")} en échec détaillée${plural(errors.length, "", "s")} sur ${totalFailed}. `
          : ""}
        Numérotation d&apos;après le fichier déposé, en-tête comprise. Dans un classeur Excel, les
        lignes entièrement vides ne sont pas comptées.
      </p>
    </div>
  );
}

export default function ImportRecordsPage() {
  const { modelId } = useParams<{ modelId: string }>();
  const { accessToken, currentOrganizationId, currentOrganization } = useAuth();
  const queryClient = useQueryClient();
  // Importer, c'est créer des fiches : même droit que « Nouvelle fiche »
  // (CREATE_EDIT_RECORD — admin, gestionnaire, opérateur ; §4.2).
  const canImport = currentOrganization ? currentOrganization.my_role !== "reader" : false;

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportMappingSuggestion | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [result, setResult] = useState<ImportCommitResult | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  // Seule la réponse d'aperçu la plus récente doit s'afficher : changer deux
  // colonnes coup sur coup ne doit pas laisser gagner la première requête.
  const previewSeq = useRef(0);

  const modelQuery = useQuery({
    queryKey: ["model-definition", currentOrganizationId, modelId],
    queryFn: () => getModelDefinition(accessToken as string, currentOrganizationId as string, modelId),
    enabled: Boolean(accessToken && currentOrganizationId && modelId),
  });

  const fields = useMemo(() => modelQuery.data?.field_definitions ?? [], [modelQuery.data]);

  const appliedMapping = useMemo(() => {
    const applied: Record<string, string> = {};
    for (const [header, fieldKey] of Object.entries(mapping)) {
      if (fieldKey && fieldKey !== IGNORE) applied[header] = fieldKey;
    }
    return applied;
  }, [mapping]);

  /** Champs obligatoires qu'aucune colonne n'alimente : toutes les lignes échoueront. */
  const unmappedRequired = useMemo(
    () => fields.filter((f) => f.is_required && !Object.values(appliedMapping).includes(f.key)),
    [fields, appliedMapping],
  );

  /** Deux colonnes vers le même champ : la dernière écrase la précédente, en silence. */
  const duplicateTargets = useMemo(() => {
    const counts = new Map<string, number>();
    for (const fieldKey of Object.values(appliedMapping)) {
      counts.set(fieldKey, (counts.get(fieldKey) ?? 0) + 1);
    }
    return fields.filter((f) => (counts.get(f.key) ?? 0) > 1);
  }, [fields, appliedMapping]);

  async function runPreview(selected: File, nextMapping?: Record<string, string>) {
    const seq = ++previewSeq.current;
    setIsPreviewing(true);
    setPreviewError(null);
    try {
      const data = await previewImport(
        accessToken as string,
        currentOrganizationId as string,
        modelId,
        selected,
        nextMapping,
      );
      if (seq !== previewSeq.current) return;
      setPreview(data);
      if (!nextMapping) {
        setMapping(
          Object.fromEntries(data.headers.map((h) => [h, data.suggested_mapping[h] ?? IGNORE])),
        );
      }
    } catch (error) {
      if (seq !== previewSeq.current) return;
      const message =
        error instanceof ApiError ? error.message : "Impossible de lire ce fichier.";
      setPreviewError(message);
      setPreview(null);
    } finally {
      if (seq === previewSeq.current) setIsPreviewing(false);
    }
  }

  function onFileChange(selected: File | null) {
    setFile(selected);
    setPreview(null);
    setMapping({});
    setResult(null);
    setPreviewError(null);
    if (selected) void runPreview(selected);
  }

  function onMappingChange(header: string, value: string) {
    const next = { ...mapping, [header]: value };
    setMapping(next);
    const applied: Record<string, string> = {};
    for (const [h, k] of Object.entries(next)) {
      if (k && k !== IGNORE) applied[h] = k;
    }
    if (file) void runPreview(file, applied);
  }

  async function onCommit() {
    if (!file) return;
    setIsCommitting(true);
    try {
      const data = await commitImport(
        accessToken as string,
        currentOrganizationId as string,
        modelId,
        file,
        appliedMapping,
      );
      setResult(data);
      if (data.created > 0) {
        await queryClient.invalidateQueries({ queryKey: ["records", currentOrganizationId, modelId] });
      }
      // Le toast reflète le résultat réel, y compris un import partiel.
      if (data.failed === 0) {
        toast.success(`${data.created} ${plural(data.created, "fiche créée", "fiches créées")}.`);
      } else if (data.created === 0) {
        toast.error("Aucune fiche créée — toutes les lignes ont été refusées.");
      } else {
        toast.warning(
          `${data.created} ${plural(data.created, "fiche créée", "fiches créées")}, ${data.failed} ${plural(data.failed, "ligne refusée", "lignes refusées")}.`,
        );
      }
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "L'import a échoué.");
    } finally {
      setIsCommitting(false);
    }
  }

  const header = (
    <div>
      <div className="flex items-center gap-2">
        <h1 className="font-heading text-2xl font-semibold text-foreground sm:text-3xl">
          Import initial
        </h1>
        {modelQuery.data ? <Badge variant="outline">{modelQuery.data.name_plural}</Badge> : null}
      </div>
      <p className="mt-0.5 text-sm text-muted-foreground">
        Reprise d&apos;un fichier tableur existant — correspondance des colonnes, puis aperçu avant
        validation.
      </p>
    </div>
  );

  // L'organisation courante n'est pas encore connue : ne pas conclure à un refus
  // de droits sur un état de chargement.
  if (!currentOrganization || modelQuery.isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (!canImport) {
    return (
      <div className="space-y-6">
        {header}
        <div className="flex items-center gap-3 rounded-xl border border-dashed border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
          <ShieldAlert className="size-4 shrink-0" />
          L&apos;import crée des fiches : il est réservé aux administrateurs, gestionnaires et
          opérateurs de l&apos;organisation.
        </div>
      </div>
    );
  }

  if (modelQuery.isError || !modelQuery.data) {
    return (
      <EmptyState
        icon={FileSpreadsheet}
        title="Modèle introuvable"
        description={
          modelQuery.error instanceof ApiError
            ? modelQuery.error.message
            : "Ce modèle n'existe pas ou n'est plus accessible."
        }
        action={
          <Button variant="outline" asChild>
            <Link href="/models">Retour à mes modèles</Link>
          </Button>
        }
      />
    );
  }

  const model = modelQuery.data;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        {header}
        <Button variant="outline" asChild>
          <Link href={`/models/${model.id}`}>
            <ArrowLeft className="size-4" />
            Retour à la liste
          </Link>
        </Button>
      </div>

      {/* --- Étape 1 : le fichier ------------------------------------------------ */}
      <section className="space-y-3 rounded-xl border border-border bg-card p-5">
        <div>
          <h2 className="font-heading text-lg font-semibold text-foreground">1. Le fichier</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Un tableur au format CSV (encodé en UTF-8) ou un classeur Excel .xlsx. La première ligne
            doit porter les en-têtes de colonnes.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="import-file">Fichier à importer</Label>
          <input
            id="import-file"
            type="file"
            accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            disabled={isCommitting}
            onChange={(event) => onFileChange(event.target.files?.[0] ?? null)}
            className="block w-full cursor-pointer rounded-lg border border-input bg-transparent text-sm text-foreground file:mr-3 file:cursor-pointer file:border-0 file:border-r file:border-input file:bg-muted file:px-3 file:py-2 file:text-sm file:font-medium file:text-foreground hover:file:bg-muted/70 disabled:cursor-not-allowed disabled:opacity-50"
          />
          {file ? (
            <p className="text-xs text-muted-foreground">
              {file.name} — {Math.max(1, Math.round(file.size / 1024))} Ko
            </p>
          ) : null}
        </div>

        {isPreviewing && !preview ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Lecture du fichier…
          </div>
        ) : null}

        {previewError ? (
          <div className="flex items-start gap-2.5 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            <span>{previewError}</span>
          </div>
        ) : null}

        {preview && preview.source_format === "xlsx" ? (
          <div className="flex items-start gap-2.5 rounded-xl border border-gold/30 bg-gold/15 px-4 py-3 text-sm text-gold-foreground">
            <FileSpreadsheet className="mt-0.5 size-4 shrink-0" />
            <span>
              Classeur Excel : seule la première feuille est importée
              {preview.sheet_name ? <> (« {preview.sheet_name} »)</> : null}.
              {preview.ignored_sheet_names.length > 0 ? (
                <>
                  {" "}
                  {preview.ignored_sheet_names.length === 1 ? "La feuille" : "Les feuilles"}{" "}
                  {preview.ignored_sheet_names.map((name) => `« ${name} »`).join(", ")}{" "}
                  {plural(preview.ignored_sheet_names.length, "n'est", "ne sont")} pas{" "}
                  {plural(preview.ignored_sheet_names.length, "lue", "lues")}.
                </>
              ) : null}
            </span>
          </div>
        ) : null}
      </section>

      {/* --- Étape 2 : la correspondance des colonnes ---------------------------- */}
      {preview ? (
        <section className="space-y-4 rounded-xl border border-border bg-card p-5">
          <div>
            <h2 className="font-heading text-lg font-semibold text-foreground">
              2. La correspondance des colonnes
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Les colonnes reconnues sont pré-remplies. Corrigez ce qui doit l&apos;être — chaque
              changement recalcule l&apos;aperçu ci-dessous.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {preview.headers.map((columnHeader) => {
              const target = mapping[columnHeader] ?? IGNORE;
              const targetField = fields.find((f) => f.key === target);
              return (
                <div key={columnHeader} className="space-y-1.5">
                  <Label htmlFor={`col-${columnHeader}`} className="text-sm text-foreground">
                    « {columnHeader} » va vers
                  </Label>
                  <Select
                    value={target}
                    onValueChange={(value) => onMappingChange(columnHeader, value)}
                    disabled={isCommitting}
                  >
                    <SelectTrigger id={`col-${columnHeader}`} className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={IGNORE}>Ne pas importer cette colonne</SelectItem>
                      {fields.map((field) => (
                        <SelectItem key={field.key} value={field.key}>
                          {field.label}
                          {field.is_required ? " *" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {targetField &&
                  (targetField.field_type === "date" || targetField.field_type === "due_date") ? (
                    <p className="text-xs text-muted-foreground">Dates attendues au format AAAA-MM-JJ.</p>
                  ) : null}
                </div>
              );
            })}
          </div>

          {unmappedRequired.length > 0 ? (
            <div className="flex items-start gap-2.5 rounded-xl border border-gold/30 bg-gold/15 px-4 py-3 text-sm text-gold-foreground">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" />
              <span>
                {plural(unmappedRequired.length, "Champ obligatoire non alimenté", "Champs obligatoires non alimentés")}{" "}
                : {unmappedRequired.map((f) => f.label).join(", ")}. Sans{" "}
                {plural(unmappedRequired.length, "colonne correspondante", "colonnes correspondantes")}, toutes les
                lignes seront refusées.
              </span>
            </div>
          ) : null}

          {duplicateTargets.length > 0 ? (
            <div className="flex items-start gap-2.5 rounded-xl border border-gold/30 bg-gold/15 px-4 py-3 text-sm text-gold-foreground">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" />
              <span>
                Plusieurs colonnes visent {plural(duplicateTargets.length, "le champ", "les champs")}{" "}
                {duplicateTargets.map((f) => f.label).join(", ")}. Pour chaque ligne, c&apos;est la
                dernière colonne renseignée qui l&apos;emporte.
              </span>
            </div>
          ) : null}
        </section>
      ) : null}

      {/* --- Étape 3 : l'aperçu avant validation --------------------------------- */}
      {preview ? (
        <section className="space-y-4 rounded-xl border border-border bg-card p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-heading text-lg font-semibold text-foreground">
                3. L&apos;aperçu avant validation
              </h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {preview.total_rows} {plural(preview.total_rows, "ligne lue", "lignes lues")} dans le
                fichier, hors en-tête.
              </p>
            </div>
            {isPreviewing ? (
              <span className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Recalcul…
              </span>
            ) : null}
          </div>

          <div
            className={`grid gap-3 sm:grid-cols-2 ${isPreviewing ? "opacity-50" : ""}`}
            aria-busy={isPreviewing}
          >
            <div className="rounded-xl border border-success/30 bg-success/10 px-4 py-3">
              <p className="text-2xl font-semibold text-success">{preview.valid_row_count}</p>
              <p className="text-sm text-success">
                {plural(preview.valid_row_count, "fiche sera créée", "fiches seront créées")}
              </p>
            </div>
            <div
              className={
                preview.invalid_row_count > 0
                  ? "rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3"
                  : "rounded-xl border border-border bg-muted/30 px-4 py-3"
              }
            >
              <p
                className={`text-2xl font-semibold ${preview.invalid_row_count > 0 ? "text-destructive" : "text-muted-foreground"}`}
              >
                {preview.invalid_row_count}
              </p>
              <p
                className={`text-sm ${preview.invalid_row_count > 0 ? "text-destructive" : "text-muted-foreground"}`}
              >
                {plural(preview.invalid_row_count, "ligne sera refusée", "lignes seront refusées")}
              </p>
            </div>
          </div>

          {preview.sample_errors.length > 0 ? (
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-foreground">Pourquoi ces lignes seraient refusées</h3>
              <RowErrorTable
                errors={preview.sample_errors}
                fields={fields}
                totalFailed={preview.invalid_row_count}
              />
            </div>
          ) : null}

          {preview.preview_rows.length > 0 ? (
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-foreground">
                Premières lignes du fichier ({preview.preview_rows.length} sur {preview.total_rows})
              </h3>
              <div className="rounded-lg border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {preview.headers.map((columnHeader) => {
                        const target = mapping[columnHeader] ?? IGNORE;
                        const targetField = fields.find((f) => f.key === target);
                        return (
                          <TableHead key={columnHeader} className="align-bottom">
                            <span className="block text-foreground">{columnHeader}</span>
                            <span className="block text-xs font-normal text-muted-foreground">
                              {targetField ? `→ ${targetField.label}` : "non importée"}
                            </span>
                          </TableHead>
                        );
                      })}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.preview_rows.map((row, index) => (
                      <TableRow key={index}>
                        {preview.headers.map((columnHeader) => {
                          const isIgnored = (mapping[columnHeader] ?? IGNORE) === IGNORE;
                          return (
                            <TableCell
                              key={columnHeader}
                              className={isIgnored ? "text-muted-foreground/60 line-through" : "text-foreground"}
                            >
                              {row[columnHeader] || "—"}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
            <Button
              onClick={() => void onCommit()}
              disabled={isCommitting || isPreviewing || preview.valid_row_count === 0}
            >
              {isCommitting ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
              Valider l&apos;import
            </Button>
            <p className="text-sm text-muted-foreground">
              {preview.valid_row_count === 0
                ? "Aucune ligne valide : rien à importer en l'état."
                : `${preview.valid_row_count} ${plural(preview.valid_row_count, "fiche", "fiches")} ${plural(preview.valid_row_count, "sera créée", "seront créées")}${preview.invalid_row_count > 0 ? `, ${preview.invalid_row_count} ${plural(preview.invalid_row_count, "ligne sera laissée de côté", "lignes seront laissées de côté")}` : ""}.`}
            </p>
          </div>
        </section>
      ) : null}

      {/* --- Résultat réel de l'import ------------------------------------------- */}
      {result ? (
        <section className="space-y-4 rounded-xl border border-border bg-card p-5">
          <div className="flex items-start gap-2.5">
            {result.failed === 0 ? (
              <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" />
            ) : (
              <TriangleAlert className="mt-0.5 size-5 shrink-0 text-gold" />
            )}
            <div>
              <h2 className="font-heading text-lg font-semibold text-foreground">
                {result.failed === 0
                  ? "Import terminé"
                  : result.created === 0
                    ? "Import refusé en totalité"
                    : "Import partiellement effectué"}
              </h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {result.created} {plural(result.created, "fiche créée", "fiches créées")}
                {result.failed > 0 ? (
                  <>
                    , {result.failed} {plural(result.failed, "ligne refusée", "lignes refusées")} —
                    {plural(result.failed, " elle n'a", " elles n'ont")} pas été importée
                    {plural(result.failed, "", "s")}.
                  </>
                ) : (
                  "."
                )}
              </p>
            </div>
          </div>

          {result.errors.length > 0 ? (
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-foreground">Lignes refusées</h3>
              <RowErrorTable errors={result.errors} fields={fields} totalFailed={result.failed} />
              <p className="text-sm text-muted-foreground">
                Corrigez ces lignes dans le fichier source, puis redéposez-le : seules les lignes
                corrigées resteront à importer.
              </p>
            </div>
          ) : null}

          {result.created > 0 ? (
            <Button variant="outline" asChild>
              <Link href={`/models/${model.id}`}>
                Voir les {model.name_plural.toLowerCase()}
              </Link>
            </Button>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
