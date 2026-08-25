"use client";

/**
 * Historique d'événements d'une fiche (cahier des charges §6.2 : entretien,
 * réparation, incident, contrôle, affectation — avec commentaire, coût facultatif
 * et pièces jointes). Liste + formulaire d'ajout, dans un seul composant
 * autonome (interroge lui-même `lib/api/records.ts`).
 */

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { CalendarClock, Loader2, Wallet } from "lucide-react";

import { FormField } from "@/components/form/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api/errors";
import { addRecordEvent, listRecordEvents } from "@/lib/api/records";
import { eventTypeLabel, RECORD_EVENT_TYPES } from "@/lib/record-events";

const eventSchema = z.object({
  event_type: z.string().min(1, "Sélectionnez un type."),
  occurred_at: z.string().min(1, "La date est obligatoire."),
  comment: z.string().max(2000, "2000 caractères maximum.").optional(),
  cost_amount: z.number().optional(),
});

type EventFormValues = z.infer<typeof eventSchema>;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface RecordEventsPanelProps {
  organizationId: string;
  accessToken: string;
  recordId: string;
  currencyCode?: string;
}

export function RecordEventsPanel({ organizationId, accessToken, recordId, currencyCode }: RecordEventsPanelProps) {
  const queryClient = useQueryClient();
  const queryKey = ["record-events", organizationId, recordId];
  const eventsQuery = useQuery({
    queryKey,
    queryFn: () => listRecordEvents(accessToken, organizationId, recordId),
  });

  const form = useForm<EventFormValues>({
    resolver: zodResolver(eventSchema),
    defaultValues: { event_type: "entretien", occurred_at: today(), comment: "", cost_amount: undefined },
  });
  const [submitting, setSubmitting] = useState(false);

  async function onValid(values: EventFormValues) {
    setSubmitting(true);
    try {
      await addRecordEvent(accessToken, organizationId, recordId, {
        event_type: values.event_type,
        occurred_at: values.occurred_at,
        comment: values.comment?.trim() ? values.comment.trim() : null,
        cost_amount: values.cost_amount ?? null,
      });
      toast.success("Événement ajouté.");
      form.reset({ event_type: "entretien", occurred_at: today(), comment: "", cost_amount: undefined });
      await queryClient.invalidateQueries({ queryKey });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Ajout de l'événement impossible.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <form
        onSubmit={form.handleSubmit(onValid)}
        noValidate
        className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-4"
      >
        <FormField id="event-type" label="Type" error={form.formState.errors.event_type?.message}>
          <Controller
            control={form.control}
            name="event_type"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="event-type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RECORD_EVENT_TYPES.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </FormField>

        <FormField id="event-date" label="Date" error={form.formState.errors.occurred_at?.message}>
          <Input id="event-date" type="date" {...form.register("occurred_at")} />
        </FormField>

        <FormField id="event-cost" label="Coût" hint="Facultatif">
          <Input
            id="event-cost"
            type="number"
            step="0.01"
            {...form.register("cost_amount", {
              setValueAs: (v) => (v === "" ? undefined : Number(v)),
            })}
          />
        </FormField>

        <div className="flex items-end">
          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
            Ajouter
          </Button>
        </div>

        <div className="sm:col-span-4">
          <FormField id="event-comment" label="Commentaire" hint="Facultatif">
            <Textarea id="event-comment" rows={2} {...form.register("comment")} />
          </FormField>
        </div>
      </form>

      {eventsQuery.isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-14 w-full rounded-lg" />
          ))}
        </div>
      ) : eventsQuery.isError ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          Impossible de charger les événements.{" "}
          <button type="button" className="underline" onClick={() => void eventsQuery.refetch()}>
            Réessayer
          </button>
        </div>
      ) : eventsQuery.data && eventsQuery.data.length > 0 ? (
        <ul className="space-y-2">
          {eventsQuery.data.map((event) => (
            <li key={event.id} className="flex items-start gap-3 rounded-lg border border-border bg-card px-3.5 py-3">
              <CalendarClock className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className="text-sm font-medium text-foreground">{eventTypeLabel(event.event_type)}</span>
                  <span className="text-xs text-muted-foreground">
                    {new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(new Date(event.occurred_at))}
                  </span>
                  {event.cost_amount != null ? (
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <Wallet className="size-3" />
                      {new Intl.NumberFormat("fr-FR", {
                        style: currencyCode ? "currency" : "decimal",
                        currency: currencyCode,
                      }).format(event.cost_amount)}
                    </span>
                  ) : null}
                </div>
                {event.comment ? <p className="mt-1 text-sm text-muted-foreground">{event.comment}</p> : null}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          Aucun événement enregistré pour cette fiche.
        </p>
      )}
    </div>
  );
}
