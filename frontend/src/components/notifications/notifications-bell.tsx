"use client";

/**
 * Centre de notifications de l'en-tête (cahier des charges §8.5 : « centre de
 * notifications, badge de compteur »). Le badge ne compte que les non-lues —
 * une alerte acquittée « sort du badge, reste dans la liste » (§8.3).
 *
 * Le texte affiché est celui que le backend a écrit (`title`/`body` de
 * `NotificationOut`) : rien n'est reconstitué côté client.
 *
 * Depuis 2026-08-26, `NotificationOut.target` porte aussi la destination — la
 * même que celle de l'écran Alertes, via `alertTargetHref`, pour qu'une même
 * alerte n'envoie pas à deux endroits différents selon l'endroit où on clique.
 * Une notification sans cible navigable reste un bouton : elle se marque comme
 * lue, sans prétendre mener quelque part.
 */

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, useReducedMotion } from "framer-motion";
import { Bell, BellOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { alertTargetHref } from "@/lib/alert-format";
import { listNotifications, markNotificationRead } from "@/lib/api/alerts";
import type { NotificationOut } from "@/lib/api/types";
import { useAuth } from "@/lib/auth/auth-context";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

/** La cloche n'affiche que les plus récentes et renvoie vers l'écran Alertes
 * pour le reste. La route est par ailleurs bornée côté backend (50 par défaut),
 * ce qui n'était pas le cas : à raison d'un appel par minute, elle rapatriait
 * l'historique complet du destinataire. */
const VISIBLE_COUNT = 8;
const POLL_INTERVAL_MS = 60_000;

export function NotificationsBell() {
  const { accessToken, currentOrganizationId } = useAuth();
  const queryClient = useQueryClient();
  const reduceMotion = useReducedMotion();
  const [open, setOpen] = useState(false);

  const queryKey = ["notifications", currentOrganizationId];
  const query = useQuery({
    queryKey,
    queryFn: () => listNotifications(accessToken as string, currentOrganizationId as string),
    enabled: Boolean(accessToken && currentOrganizationId),
    refetchInterval: POLL_INTERVAL_MS,
  });

  const notifications = query.data ?? [];
  const unreadCount = notifications.filter((n) => !n.is_read).length;
  const visible = notifications.slice(0, VISIBLE_COUNT);

  const markRead = useMutation({
    mutationFn: (notification: NotificationOut) =>
      markNotificationRead(accessToken as string, currentOrganizationId as string, notification.id),
    onSuccess: (updated) => {
      queryClient.setQueryData<NotificationOut[]>(queryKey, (prev) =>
        prev ? prev.map((n) => (n.id === updated.id ? updated : n)) : prev,
      );
    },
    // Pas de toast en cas d'échec : marquer comme lue est un geste de confort,
    // l'échec se voit déjà — la notification reste marquée non lue.
  });

  const label =
    unreadCount > 0 ? `Notifications — ${unreadCount} non lue${unreadCount > 1 ? "s" : ""}` : "Notifications";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={label}>
          <Bell className="size-4" />
          {unreadCount > 0 ? (
            <motion.span
              key={unreadCount}
              initial={reduceMotion ? false : { scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 500, damping: 24 }}
              className="absolute -top-0.5 -right-0.5 flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[0.65rem] font-semibold tabular-nums text-destructive-foreground"
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </motion.span>
          ) : null}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-[22rem] p-0">
        <div className="flex items-center justify-between border-b border-border/70 px-3 py-2">
          <span className="text-sm font-medium text-foreground">Notifications</span>
          <span className="text-xs text-muted-foreground">
            {unreadCount > 0 ? `${unreadCount} non lue${unreadCount > 1 ? "s" : ""}` : "Tout est lu"}
          </span>
        </div>

        <div className="max-h-[24rem] overflow-y-auto">
          {query.isLoading ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">Chargement…</p>
          ) : query.isError ? (
            <div className="px-3 py-6 text-center">
              <p className="text-sm text-muted-foreground">Impossible de charger les notifications.</p>
              <Button variant="outline" size="sm" className="mt-2" onClick={() => void query.refetch()}>
                Réessayer
              </Button>
            </div>
          ) : visible.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-3 py-8 text-center">
              <BellOff className="size-5 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Aucune notification pour le moment.</p>
            </div>
          ) : (
            <ul className="divide-y divide-border/70">
              {visible.map((notification) => (
                <li key={notification.id}>
                  <NotificationRow
                    notification={notification}
                    onRead={() => {
                      if (!notification.is_read) markRead.mutate(notification);
                    }}
                    onNavigate={() => setOpen(false)}
                  >
                    <span className="flex items-start justify-between gap-2">
                      <span className="text-sm font-medium text-foreground">{notification.title}</span>
                      {/* La pastille ne porte jamais l'état seule (§7.2) : le mot
                          « Non lue » l'accompagne toujours. */}
                      {notification.is_read ? null : (
                        <span className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-full bg-warning/15 px-1.5 py-0.5 text-[0.65rem] font-medium text-warning-foreground dark:bg-warning/20">
                          <span className="size-1.5 rounded-full bg-current" aria-hidden />
                          Non lue
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">{notification.body}</span>
                    <span className="mt-1 block text-[0.7rem] text-muted-foreground">
                      {formatDateTime(notification.created_at)}
                    </span>
                  </NotificationRow>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="border-t border-border/70 px-3 py-2">
          <Link
            href="/alertes"
            onClick={() => setOpen(false)}
            className="text-sm text-primary hover:underline"
          >
            Voir toutes les alertes
            {notifications.length > visible.length ? ` (${notifications.length} notifications)` : null}
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Une ligne de la cloche : un LIEN quand la notification mène quelque part, un
 * bouton sinon.
 *
 * La distinction n'est pas cosmétique — playbook §6 : « les liens qui n'en sont
 * pas doivent être des `<button>` ». Un lecteur d'écran annonce « lien » ou
 * « bouton », et l'utilisateur attend une navigation dans un cas, une action
 * dans l'autre. Dans les deux cas la notification est marquée lue.
 */
function NotificationRow({
  notification,
  onRead,
  onNavigate,
  children,
}: {
  notification: NotificationOut;
  onRead: () => void;
  onNavigate: () => void;
  children: React.ReactNode;
}) {
  const href = alertTargetHref(notification.target);
  const className = cn(
    "block w-full px-3 py-2.5 text-left transition-colors",
    "hover:bg-muted focus-visible:bg-muted focus-visible:outline-none",
    notification.is_read ? "opacity-70" : null,
  );

  if (href) {
    return (
      <Link
        href={href}
        className={className}
        onClick={() => {
          onRead();
          onNavigate();
        }}
      >
        {children}
      </Link>
    );
  }

  return (
    <button type="button" disabled={notification.is_read} onClick={onRead} className={cn(className, notification.is_read && "cursor-default")}>
      {children}
    </button>
  );
}
