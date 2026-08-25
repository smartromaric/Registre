"use client";

/**
 * Liste des tableaux de bord enregistrés (cahier des charges §10.4) : cliquer
 * un nom charge son périmètre, une pastille épingle/désépingle comme page
 * d'accueil, une corbeille supprime (confirmation via `AlertDialog`, même
 * gabarit que `ExistingFieldList`).
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Bookmark, Loader2, Pin, PinOff, Trash2 } from "lucide-react";

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
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ApiError } from "@/lib/api/errors";
import { deleteSavedDashboard, listSavedDashboards, updateSavedDashboard } from "@/lib/api/dashboards";
import type { SavedDashboardOut } from "@/lib/api/types";

export interface SavedDashboardsMenuProps {
  organizationId: string;
  accessToken: string;
  onLoad: (dashboard: SavedDashboardOut) => void;
}

export function SavedDashboardsMenu({ organizationId, accessToken, onLoad }: SavedDashboardsMenuProps) {
  const queryClient = useQueryClient();
  const queryKey = ["saved-dashboards", organizationId];

  const query = useQuery({
    queryKey,
    queryFn: () => listSavedDashboards(accessToken, organizationId),
    enabled: Boolean(accessToken && organizationId),
  });

  const pinMutation = useMutation({
    mutationFn: ({ id, pinned }: { id: string; pinned: boolean }) =>
      updateSavedDashboard(accessToken, organizationId, id, { is_pinned: pinned }),
    onSuccess: (updated) => {
      queryClient.setQueryData<SavedDashboardOut[]>(queryKey, (prev) =>
        prev?.map((d) => (d.id === updated.id ? updated : { ...d, is_pinned: updated.is_pinned ? false : d.is_pinned })),
      );
      queryClient.invalidateQueries({ queryKey: ["dashboard-pinned", organizationId] });
      toast.success(updated.is_pinned ? "Épinglé comme page d'accueil." : "Désépinglé.");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Action impossible."),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteSavedDashboard(accessToken, organizationId, id),
    onSuccess: (_data, id) => {
      queryClient.setQueryData<SavedDashboardOut[]>(queryKey, (prev) => prev?.filter((d) => d.id !== id));
      queryClient.invalidateQueries({ queryKey: ["dashboard-pinned", organizationId] });
      toast.success("Tableau de bord supprimé.");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Suppression impossible."),
  });

  const dashboards = query.data ?? [];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <Bookmark className="size-3.5" />
          Mes tableaux de bord
          {dashboards.length > 0 ? <span className="text-muted-foreground">({dashboards.length})</span> : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel>Tableaux de bord enregistrés</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {query.isLoading ? (
          <div className="flex items-center justify-center px-2 py-4 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
          </div>
        ) : dashboards.length === 0 ? (
          <p className="px-2 py-3 text-sm text-muted-foreground">
            Aucun tableau de bord enregistré. Réglez un périmètre puis « Enregistrer ».
          </p>
        ) : (
          dashboards.map((dashboard) => (
            <div key={dashboard.id} className="flex items-center gap-0.5">
              <DropdownMenuItem onSelect={() => onLoad(dashboard)} className="flex-1">
                <span className="flex-1 truncate">{dashboard.name}</span>
                {dashboard.is_pinned ? <Pin className="size-3 shrink-0 text-primary" aria-label="Épinglé" /> : null}
              </DropdownMenuItem>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={dashboard.is_pinned ? `Désépingler ${dashboard.name}` : `Épingler ${dashboard.name} comme page d'accueil`}
                title={dashboard.is_pinned ? "Désépingler" : "Épingler comme page d'accueil"}
                onClick={() => pinMutation.mutate({ id: dashboard.id, pinned: !dashboard.is_pinned })}
                disabled={pinMutation.isPending}
              >
                {dashboard.is_pinned ? <PinOff className="size-3" /> : <Pin className="size-3" />}
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`Supprimer ${dashboard.name}`}
                    className="text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="size-3" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Supprimer « {dashboard.name} » ?</AlertDialogTitle>
                    <AlertDialogDescription>Cette action est définitive.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Annuler</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      onClick={() => deleteMutation.mutate(dashboard.id)}
                    >
                      Supprimer
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
