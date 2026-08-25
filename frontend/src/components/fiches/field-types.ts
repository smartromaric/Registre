import {
  Calendar,
  CalendarClock,
  CreditCard,
  FileText,
  Hash,
  Image as ImageIcon,
  Link2,
  ListChecks,
  MapPin,
  Phone,
  QrCode,
  SquareCheck,
  Type,
  type LucideIcon,
} from "lucide-react";

import type { FieldType } from "@/lib/api/types";

/** Les 14 types de champ du moteur de fiches (cahier des charges §5.2), avec leur
 * libellé français et leur icône — un seul endroit pour cette correspondance,
 * utilisé par le sélecteur de type du constructeur de modèles. */
export const FIELD_TYPE_OPTIONS: { value: FieldType; label: string; icon: LucideIcon }[] = [
  { value: "text_short", label: "Texte court", icon: Type },
  { value: "text_long", label: "Texte long", icon: FileText },
  { value: "number", label: "Nombre", icon: Hash },
  { value: "amount", label: "Montant", icon: CreditCard },
  { value: "date", label: "Date", icon: Calendar },
  { value: "due_date", label: "Échéance", icon: CalendarClock },
  { value: "boolean", label: "Oui / Non", icon: SquareCheck },
  { value: "select", label: "Liste de choix", icon: ListChecks },
  { value: "document", label: "Document", icon: FileText },
  { value: "photo", label: "Photo", icon: ImageIcon },
  { value: "phone", label: "Téléphone", icon: Phone },
  { value: "record_link", label: "Lien vers une fiche", icon: Link2 },
  { value: "position", label: "Position", icon: MapPin },
  { value: "code", label: "Code", icon: QrCode },
];

export function fieldTypeLabel(type: FieldType): string {
  return FIELD_TYPE_OPTIONS.find((o) => o.value === type)?.label ?? type;
}

export function fieldTypeIcon(type: FieldType): LucideIcon {
  return FIELD_TYPE_OPTIONS.find((o) => o.value === type)?.icon ?? Type;
}
