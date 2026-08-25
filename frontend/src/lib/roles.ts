import type { OrgRole, PaymentMethod, PaymentStatus, SubscriptionStatus } from "./api/types";

/** Libellés français des rôles d'organisation (cahier des charges §4.1). L'Éditeur
 * n'apparaît pas ici : c'est un rôle de plateforme (`User.is_platform_admin`), pas
 * un `OrgRole`. */
export const ROLE_LABELS: Record<OrgRole, string> = {
  admin: "Administrateur",
  manager: "Gestionnaire",
  operator: "Opérateur",
  reader: "Lecteur",
};

/** Libellés français des états d'abonnement (cahier des charges §12.3). */
export const SUBSCRIPTION_STATUS_LABELS: Record<SubscriptionStatus, string> = {
  trial: "Essai",
  active: "Actif",
  read_only: "Lecture seule",
  suspended: "Suspendu",
  archived: "Archivé",
};

/** Jetons de tonalité (couleurs de thème) par état d'abonnement — même
 * vocabulaire que `MOVEMENT_TYPE_TONE_CLASSES` (lib/stock-format.ts) : essai en
 * or (mise en avant temporaire), actif en succès, lecture seule en
 * avertissement, suspendu/archivé en atténué/destructif. */
export const SUBSCRIPTION_STATUS_TONE_CLASSES: Record<SubscriptionStatus, string> = {
  trial: "bg-gold/15 text-gold-foreground dark:bg-gold/20",
  active: "bg-success/10 text-success dark:bg-success/20",
  read_only: "bg-warning/15 text-warning-foreground dark:bg-warning/20",
  suspended: "bg-destructive/10 text-destructive dark:bg-destructive/20",
  archived: "bg-muted text-muted-foreground",
};

/** Libellés français des statuts de règlement (cahier des charges §12.4). */
export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  declared: "Déclaré",
  validated: "Validé",
  rejected: "Rejeté",
};

export const PAYMENT_STATUS_TONE_CLASSES: Record<PaymentStatus, string> = {
  declared: "bg-warning/15 text-warning-foreground dark:bg-warning/20",
  validated: "bg-success/10 text-success dark:bg-success/20",
  rejected: "bg-destructive/10 text-destructive dark:bg-destructive/20",
};

/** Libellés français des moyens de paiement (`PaymentMethod`, §12.4). */
export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  mobile_money: "Mobile Money",
  bank_transfer: "Virement bancaire",
  cash: "Espèces",
  other: "Autre",
};
