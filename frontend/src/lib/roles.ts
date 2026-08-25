import type { OrgRole } from "./api/types";

/** Libellés français des rôles d'organisation (cahier des charges §4.1). L'Éditeur
 * n'apparaît pas ici : c'est un rôle de plateforme (`User.is_platform_admin`), pas
 * un `OrgRole`. */
export const ROLE_LABELS: Record<OrgRole, string> = {
  admin: "Administrateur",
  manager: "Gestionnaire",
  operator: "Opérateur",
  reader: "Lecteur",
};
