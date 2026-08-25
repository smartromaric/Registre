/**
 * Types TypeScript en miroir exact des schémas Pydantic du backend (`backend/app/schemas/*.py`).
 * Une seule règle : si un champ ou une forme change côté backend, ce fichier doit changer
 * en même temps. Rien n'est déduit ou deviné ici, tout vient d'un fichier Python lu.
 */

// --- backend/app/models/membership.py:OrgRole ------------------------------------------
export type OrgRole = "admin" | "manager" | "operator" | "reader";

// --- backend/app/schemas/user.py --------------------------------------------------------
export interface UserOut {
  id: string;
  email: string;
  full_name: string;
  is_active: boolean;
  is_platform_admin: boolean;
}

// --- backend/app/schemas/organization.py --------------------------------------------------
export interface OrganizationCreate {
  name: string;
  country_code: string;
  sector?: string | null;
}

export interface OrganizationUpdate {
  name?: string | null;
  legal_name?: string | null;
  sector?: string | null;
  currency_code?: string | null;
  timezone?: string | null;
}

export interface OrganizationOut {
  id: string;
  name: string;
  legal_name: string | null;
  country_code: string;
  currency_code: string;
  sector: string | null;
  timezone: string;
  trial_ends_at: string; // ISO 8601 (datetime)
  created_at: string; // ISO 8601 (datetime)
}

export interface OrganizationWithRole extends OrganizationOut {
  my_role: OrgRole;
}

// --- backend/app/schemas/membership.py ------------------------------------------------
export interface MembershipOut {
  id: string;
  organization_id: string;
  role: OrgRole;
  can_view_amounts: boolean;
  is_active: boolean;
  invited_at: string | null;
  user: UserOut;
}

// --- backend/app/schemas/auth.py --------------------------------------------------------
export interface SignupRequest {
  email: string;
  password: string;
  full_name: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface GoogleAuthRequest {
  id_token: string;
}

export interface RefreshRequest {
  refresh_token: string;
}

export interface TokenPairOut {
  access_token: string;
  refresh_token: string;
  token_type: "bearer";
}

export interface AuthResponse {
  tokens: TokenPairOut;
  user: UserOut;
  is_new_user: boolean;
}

// =========================================================================
// Moteur de fiches — mode ADDITIF, ne pas toucher aux types ci-dessus.
// =========================================================================

// --- backend/app/dynamic_fields/types.py:FieldType --------------------------------------
/** Les 13 types de champ du moteur de fiches (cahier des charges §5.2). */
export type FieldType =
  | "text_short"
  | "text_long"
  | "number"
  | "amount"
  | "date"
  | "due_date"
  | "boolean"
  | "select"
  | "document"
  | "photo"
  | "phone"
  | "record_link"
  | "position"
  | "code";

/** Paliers de rappel par défaut d'un champ Échéance (cahier des charges §8.1). */
export const DEFAULT_REMINDER_OFFSETS_DAYS: readonly number[] = [60, 30, 7, 0];
export const DEFAULT_REMINDER_REPEAT_DAYS_OVERDUE = 3;

// --- backend/app/models/model_definition.py:RecordNature --------------------------------
export type RecordNature = "asset" | "stock_item";

// --- backend/app/schemas/model_definition.py -------------------------------------------
export interface FieldOption {
  value: string;
  label: string;
}

export interface FieldDefinitionCreate {
  key: string;
  label: string;
  field_type: FieldType;
  position?: number;
  is_required?: boolean;
  is_unique?: boolean;
  default_value?: unknown;
  help_text?: string | null;
  show_in_list?: boolean;
  is_filterable?: boolean;
  select_options?: FieldOption[] | null;
  select_multiple?: boolean;
  number_unit?: string | null;
  visible_roles?: OrgRole[] | null;
  editable_roles?: OrgRole[] | null;
  reminder_offsets_days?: number[] | null;
  reminder_repeat_days_overdue?: number | null;
}

/** Ne permet jamais de changer `key` ni `field_type` — voir
 * `PATCH .../fields/{id}` côté backend : les fiches déjà écrites portent leurs
 * valeurs sous cette clé et sous cette forme. */
export interface FieldDefinitionUpdate {
  label?: string | null;
  position?: number | null;
  is_required?: boolean | null;
  is_unique?: boolean | null;
  default_value?: unknown;
  help_text?: string | null;
  show_in_list?: boolean | null;
  is_filterable?: boolean | null;
  select_options?: FieldOption[] | null;
  select_multiple?: boolean | null;
  number_unit?: string | null;
  visible_roles?: OrgRole[] | null;
  editable_roles?: OrgRole[] | null;
  reminder_offsets_days?: number[] | null;
  reminder_repeat_days_overdue?: number | null;
}

export interface FieldDefinitionOut {
  id: string;
  key: string;
  label: string;
  field_type: FieldType;
  position: number;
  is_required: boolean;
  is_unique: boolean;
  default_value: unknown;
  help_text: string | null;
  show_in_list: boolean;
  is_filterable: boolean;
  select_options: FieldOption[] | null;
  select_multiple: boolean;
  number_unit: string | null;
  visible_roles: OrgRole[] | null;
  editable_roles: OrgRole[] | null;
  reminder_offsets_days: number[] | null;
  reminder_repeat_days_overdue: number | null;
}

export interface FieldReorderRequest {
  field_ids: string[];
}

export interface ModelDefinitionCreate {
  name_singular: string;
  name_plural: string;
  icon?: string | null;
  color?: string | null;
  nature: RecordNature;
  title_field_key?: string | null;
  status_options?: string[] | null;
  fields?: FieldDefinitionCreate[];
}

export interface ModelDefinitionUpdate {
  name_singular?: string | null;
  name_plural?: string | null;
  icon?: string | null;
  color?: string | null;
  title_field_key?: string | null;
  status_options?: string[] | null;
  is_archived?: boolean | null;
}

export interface ModelDefinitionOut {
  id: string;
  name_singular: string;
  name_plural: string;
  icon: string | null;
  color: string | null;
  nature: RecordNature;
  title_field_key: string | null;
  status_options: string[] | null;
  source_template_key: string | null;
  is_archived: boolean;
  field_definitions: FieldDefinitionOut[];
}

// --- backend/app/api/v1/routers/templates.py:list_templates (forme ad hoc, pas un schéma
// Pydantic dédié) — bibliothèque de modèles prêts à l'emploi (cahier des charges §5.6). ---
export interface TemplateSummary {
  key: string;
  name_singular: string;
  name_plural: string;
  nature: RecordNature;
  icon: string | null;
  color: string | null;
  field_count: number;
}

// --- backend/app/schemas/record.py ------------------------------------------------------
export interface RecordCreate {
  data?: Record<string, unknown>;
  status?: string | null;
  site?: string | null;
  assigned_person_record_id?: string | null;
}

export interface RecordUpdate {
  data?: Record<string, unknown> | null;
  status?: string | null;
  site?: string | null;
  assigned_person_record_id?: string | null;
}

export interface RecordOut {
  id: string;
  model_definition_id: string;
  data: Record<string, unknown>;
  status: string | null;
  site: string | null;
  assigned_person_record_id: string | null;
  is_archived: boolean;
  archived_at: string | null; // ISO 8601 (datetime)
  created_at: string; // ISO 8601 (datetime)
  updated_at: string; // ISO 8601 (datetime)
}

export interface RecordListOut {
  items: RecordOut[];
  total: number;
  limit: number;
  offset: number;
}

export interface RecordEventCreate {
  event_type: string;
  occurred_at: string; // AAAA-MM-JJ
  comment?: string | null;
  cost_amount?: number | null;
  document_ids?: string[] | null;
}

export interface RecordEventOut {
  id: string;
  record_id: string;
  event_type: string;
  occurred_at: string; // AAAA-MM-JJ
  comment: string | null;
  cost_amount: number | null;
  document_ids: string[] | null;
  created_at: string; // ISO 8601 (datetime)
}

// --- backend/app/schemas/document.py ----------------------------------------------------
export interface DocumentOut {
  id: string;
  record_id: string;
  field_key: string | null;
  filename: string;
  content_type: string;
  size_bytes: number;
  created_at: string; // ISO 8601 (datetime)
}

/** `url` est une URL signée à courte durée de vie (§14.1) — fraîche à chaque appel de
 * `uploadDocument`/`listDocuments`/`getDocument`, jamais à mémoriser au-delà de l'usage
 * immédiat qui en est fait. */
export interface DocumentWithUrlOut extends DocumentOut {
  url: string;
}

// --- Formes de valeur JSON par type de champ (backend/app/dynamic_fields/validation.py) —
// ce que `Record.data[field.key]` contient réellement selon `field.field_type`. Les types
// simples (texte, nombre, date ISO, booléen, liste de choix) sont déjà des types TS natifs
// et n'ont pas besoin d'interface dédiée. -------------------------------------------------
export interface DueDateFieldValue {
  due_date: string; // AAAA-MM-JJ
  document_id: string | null;
}

export interface DocumentFieldValue {
  document_id: string;
}

export interface PhotoFieldValue {
  document_ids: string[];
}

export interface RecordLinkFieldValue {
  record_id: string;
}

export interface PositionFieldValue {
  lat: number;
  lng: number;
}
