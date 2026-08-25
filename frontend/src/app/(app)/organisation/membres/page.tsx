"use client";

/**
 * Écran de gestion des membres de l'organisation (cahier des charges §4.4,
 * MANUEL_UTILISATION.md §2 "Inviter des collègues") — jusqu'ici sans aucune
 * interface, seul l'endpoint backend existait. Réservé à l'ADMIN : `GET
 * .../members` est en fait ouvert à tout membre actif côté backend
 * (`get_org_context` seul), mais inviter et modifier un membre exigent le
 * rôle ADMIN (`Action.MANAGE_MEMBERS`, voir `lib/api/members.ts`) — un écran
 * de lecture seule sans aucune action n'aurait pas d'utilité ici, donc gate
 * total plutôt que partiel, même principe qu'`app/(app)/abonnement/page.tsx`
 * pour ses actions réservées à l'ADMIN.
 */

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";
import { Loader2, ShieldAlert, UserPlus, Users } from "lucide-react";

import { DataTable } from "@/components/data-table";
import { InviteMemberDialog } from "@/components/members/invite-member-dialog";
import { EmptyState } from "@/components/state-views";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ApiError } from "@/lib/api/errors";
import { listMembers, updateMember } from "@/lib/api/members";
import type { MembershipOut, MembershipUpdate, OrgRole } from "@/lib/api/types";
import { useAuth } from "@/lib/auth/auth-context";
import { ROLE_LABELS } from "@/lib/roles";

const ROLES: OrgRole[] = ["admin", "manager", "operator", "reader"];

function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function MembersPage() {
  const { accessToken, currentOrganizationId, currentOrganization, user } = useAuth();
  const queryClient = useQueryClient();
  const isAdmin = currentOrganization?.my_role === "admin";
  const queryKey = ["members", currentOrganizationId];
  const [pendingId, setPendingId] = useState<string | null>(null);

  const query = useQuery({
    queryKey,
    queryFn: () => listMembers(accessToken as string, currentOrganizationId as string),
    enabled: Boolean(accessToken && currentOrganizationId) && isAdmin,
  });

  function upsertMember(membership: MembershipOut) {
    queryClient.setQueryData<MembershipOut[]>(queryKey, (prev) => {
      if (!prev) return [membership];
      const exists = prev.some((m) => m.id === membership.id);
      return exists ? prev.map((m) => (m.id === membership.id ? membership : m)) : [...prev, membership];
    });
  }

  async function patchMember(membershipId: string, payload: MembershipUpdate) {
    setPendingId(membershipId);
    try {
      const updated = await updateMember(
        accessToken as string,
        currentOrganizationId as string,
        membershipId,
        payload,
      );
      upsertMember(updated);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Mise à jour du membre impossible.");
    } finally {
      setPendingId(null);
    }
  }

  if (!isAdmin) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="font-heading text-2xl font-semibold text-foreground sm:text-3xl">Membres</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Gestion des membres de {currentOrganization?.name ?? "l'organisation"} (§4.4).
          </p>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-dashed border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
          <ShieldAlert className="size-4 shrink-0" />
          Cet écran est réservé aux administrateurs de l&apos;organisation.
        </div>
      </div>
    );
  }

  const inviteTrigger = (
    <Button>
      <UserPlus className="size-4" />
      Inviter
    </Button>
  );

  const columns: ColumnDef<MembershipOut, unknown>[] = [
    {
      id: "member",
      header: "Membre",
      cell: ({ row }) => {
        const m = row.original;
        return (
          <div className="flex min-w-0 items-center gap-2.5">
            <Avatar size="sm">
              <AvatarFallback>{initials(m.user.full_name)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">{m.user.full_name}</p>
              <p className="truncate text-xs text-muted-foreground">{m.user.email}</p>
            </div>
          </div>
        );
      },
    },
    {
      id: "role",
      header: "Rôle",
      cell: ({ row }) => {
        const m = row.original;
        return (
          <Select
            value={m.role}
            onValueChange={(role) => void patchMember(m.id, { role: role as OrgRole })}
            disabled={pendingId === m.id}
          >
            <SelectTrigger size="sm" className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ROLES.map((role) => (
                <SelectItem key={role} value={role}>
                  {ROLE_LABELS[role]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      },
    },
    {
      id: "amounts",
      header: "Voit les montants",
      cell: ({ row }) => {
        const m = row.original;
        return (
          <Switch
            size="sm"
            checked={m.can_view_amounts}
            onCheckedChange={(checked) => void patchMember(m.id, { can_view_amounts: checked })}
            disabled={pendingId === m.id}
            aria-label={`Voit les montants — ${m.user.full_name}`}
          />
        );
      },
    },
    {
      id: "status",
      header: "Statut",
      cell: ({ row }) => {
        const m = row.original;
        if (!m.is_active) {
          return <Badge variant="secondary">Désactivé</Badge>;
        }
        if (!m.user.is_active) {
          return (
            <Badge variant="outline" className="border-gold/30 bg-gold/15 text-gold-foreground">
              En attente
            </Badge>
          );
        }
        return (
          <Badge variant="outline" className="border-success/30 bg-success/10 text-success">
            Actif
          </Badge>
        );
      },
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => {
        const m = row.original;
        const isSelf = m.user.id === user?.id;
        const busy = pendingId === m.id;

        if (!m.is_active) {
          return (
            <Button variant="outline" size="sm" disabled={busy} onClick={() => void patchMember(m.id, { is_active: true })}>
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
              Réactiver
            </Button>
          );
        }

        return (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                disabled={busy || isSelf}
                title={isSelf ? "Vous ne pouvez pas vous désactiver vous-même." : undefined}
              >
                Désactiver
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Désactiver {m.user.full_name} ?</AlertDialogTitle>
                <AlertDialogDescription>
                  Ce membre perd immédiatement l&apos;accès à l&apos;organisation. Réversible à tout moment depuis
                  cette même liste — ses fiches et son historique restent intacts.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Annuler</AlertDialogCancel>
                <AlertDialogAction variant="destructive" onClick={() => void patchMember(m.id, { is_active: false })}>
                  Désactiver
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold text-foreground sm:text-3xl">Membres</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Invitez des collègues et gérez leurs accès à {currentOrganization?.name ?? "l'organisation"} (§4.4).
          </p>
        </div>
        <InviteMemberDialog
          organizationId={currentOrganizationId as string}
          accessToken={accessToken as string}
          onInvited={upsertMember}
          trigger={inviteTrigger}
        />
      </div>

      <DataTable<MembershipOut>
        columns={columns}
        data={query.data ?? []}
        getRowId={(row) => row.id}
        isLoading={query.isFetching}
        error={query.isError ? (query.error instanceof ApiError ? query.error.message : "Erreur inconnue.") : null}
        onRetry={() => void query.refetch()}
        caption={query.data ? `${query.data.length} membre${query.data.length !== 1 ? "s" : ""}` : undefined}
        emptyState={
          <EmptyState
            icon={Users}
            title="Aucun membre"
            description="Invitez un collègue pour qu'il rejoigne l'organisation."
            action={
              <InviteMemberDialog
                organizationId={currentOrganizationId as string}
                accessToken={accessToken as string}
                onInvited={upsertMember}
                trigger={inviteTrigger}
              />
            }
            className="border-none bg-transparent px-6 py-16"
          />
        }
      />
    </div>
  );
}
