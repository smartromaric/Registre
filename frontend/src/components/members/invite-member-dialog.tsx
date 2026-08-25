"use client";

/**
 * Invitation d'un nouveau membre (cahier des charges §4.4, MANUEL_UTILISATION.md
 * §2 "Inviter des collègues"). Le backend crée toujours le membre — l'e-mail
 * d'invitation, lui, dépend d'un SMTP configuré côté serveur
 * (`MembershipService.invite`). Quand il ne l'est pas, `invitation_link` porte
 * le lien à transmettre à la main : on ne laisse jamais l'administrateur avec
 * un simple toast de succès sans moyen réel de faire suivre l'invitation.
 */

import { useState, type ReactNode } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Check, Copy, Loader2 } from "lucide-react";

import { FormField } from "@/components/form/form-field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ApiError } from "@/lib/api/errors";
import { inviteMember } from "@/lib/api/members";
import type { MembershipOut, OrgRole } from "@/lib/api/types";
import { ROLE_LABELS } from "@/lib/roles";

const ROLES: OrgRole[] = ["admin", "manager", "operator", "reader"];

const inviteSchema = z.object({
  email: z.email("Adresse e-mail invalide."),
  full_name: z.string().min(1, "Le nom complet est requis.").max(200, "200 caractères maximum."),
  role: z.enum(["admin", "manager", "operator", "reader"], { message: "Choisissez un rôle." }),
  can_view_amounts: z.boolean(),
});
type InviteValues = z.infer<typeof inviteSchema>;

const DEFAULT_VALUES: InviteValues = {
  email: "",
  full_name: "",
  role: "operator",
  can_view_amounts: true,
};

export interface InviteMemberDialogProps {
  organizationId: string;
  accessToken: string;
  trigger: ReactNode;
  onInvited: (membership: MembershipOut) => void;
}

export function InviteMemberDialog({ organizationId, accessToken, trigger, onInvited }: InviteMemberDialogProps) {
  const [open, setOpen] = useState(false);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const form = useForm<InviteValues>({ resolver: zodResolver(inviteSchema), defaultValues: DEFAULT_VALUES });
  const { control, register, handleSubmit, formState } = form;

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      form.reset(DEFAULT_VALUES);
      setShareLink(null);
      setCopied(false);
    }
  }

  const mutation = useMutation({
    mutationFn: (values: InviteValues) =>
      inviteMember(accessToken, organizationId, {
        email: values.email.trim().toLowerCase(),
        full_name: values.full_name.trim(),
        role: values.role,
        can_view_amounts: values.can_view_amounts,
      }),
    onSuccess: (result) => {
      onInvited(result.membership);
      if (result.invitation_email_sent) {
        toast.success(`Invitation envoyée à ${result.membership.user.email}.`);
        setOpen(false);
        return;
      }
      if (result.invitation_link) {
        // SMTP non configuré : on garde la boîte de dialogue ouverte pour
        // transmettre le lien plutôt que de refermer sur un succès muet.
        setShareLink(result.invitation_link);
        return;
      }
      // Ni e-mail envoyé ni lien : la personne existait déjà et avait un
      // compte actif — simplement ajoutée à l'organisation, rien à transmettre.
      toast.success(`${result.membership.user.full_name} a été ajouté·e à l'organisation.`);
      setOpen(false);
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Invitation impossible.");
    },
  });

  async function copyLink() {
    if (!shareLink) return;
    try {
      await navigator.clipboard.writeText(shareLink);
      setCopied(true);
      toast.success("Lien copié dans le presse-papiers.");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Copie impossible — sélectionnez le lien manuellement.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        {shareLink ? (
          <>
            <DialogHeader>
              <DialogTitle>Membre ajouté — invitation à transmettre</DialogTitle>
              <DialogDescription>
                L&apos;e-mail d&apos;invitation n&apos;a pas pu être envoyé automatiquement (aucun serveur de
                messagerie configuré sur cet environnement). Le membre est bien créé : partagez-lui ce lien
                vous-même pour qu&apos;il puisse activer son compte.
              </DialogDescription>
            </DialogHeader>

            <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 p-1.5">
              <Input
                readOnly
                value={shareLink}
                onFocus={(event) => event.currentTarget.select()}
                className="border-none bg-transparent shadow-none focus-visible:ring-0"
              />
              <Button
                type="button"
                size="icon-sm"
                variant="outline"
                onClick={() => void copyLink()}
                aria-label="Copier le lien d'invitation"
                className="shrink-0"
              >
                {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
              </Button>
            </div>

            <DialogFooter>
              <Button type="button" onClick={() => setOpen(false)}>
                Fermer
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Inviter un membre</DialogTitle>
              <DialogDescription>
                Envoyez une invitation par e-mail pour rejoindre l&apos;organisation (§4.4).
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSubmit((v) => mutation.mutate(v))} noValidate className="space-y-3">
              <FormField id="invite-full-name" label="Nom complet" error={formState.errors.full_name?.message}>
                <Input id="invite-full-name" placeholder="Awa Ngo" {...register("full_name")} />
              </FormField>

              <FormField id="invite-email" label="Adresse e-mail" error={formState.errors.email?.message}>
                <Input
                  id="invite-email"
                  type="email"
                  placeholder="collegue@entreprise.com"
                  {...register("email")}
                />
              </FormField>

              <FormField id="invite-role" label="Rôle" error={formState.errors.role?.message}>
                <Controller
                  control={control}
                  name="role"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="invite-role" className="w-full">
                        <SelectValue placeholder="Choisir un rôle" />
                      </SelectTrigger>
                      <SelectContent>
                        {ROLES.map((role) => (
                          <SelectItem key={role} value={role}>
                            {ROLE_LABELS[role]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </FormField>

              <label className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
                <span>
                  <span className="block text-sm font-medium text-foreground">Voir les montants</span>
                  <span className="block text-xs text-muted-foreground">
                    Autorise ce membre à consulter les valeurs monétaires (§4.2).
                  </span>
                </span>
                <Controller
                  control={control}
                  name="can_view_amounts"
                  render={({ field }) => <Switch checked={field.value} onCheckedChange={field.onChange} />}
                />
              </label>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Annuler
                </Button>
                <Button type="submit" disabled={mutation.isPending}>
                  {mutation.isPending ? <Loader2 className="size-3.5 animate-spin" /> : null}
                  Envoyer l&apos;invitation
                </Button>
              </DialogFooter>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
