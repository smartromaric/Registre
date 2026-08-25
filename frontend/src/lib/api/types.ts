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

// =========================================================================
// Module Stock (cahier des charges §7) — mode ADDITIF, ne pas toucher aux
// types ci-dessus. Miroir exact de backend/app/schemas/stock.py. Un article
// de stock est une `Record` (nature `stock_item`, voir plus haut) dont les
// données propres au stock (config, variantes, niveaux, mouvements, lots,
// consignation) vivent dans des tables dédiées, séparées de `Record.data`.
// =========================================================================

export interface DepotCreate {
  name: string;
  address?: string | null;
}

export interface DepotUpdate {
  name?: string | null;
  address?: string | null;
  is_active?: boolean | null;
}

export interface DepotOut {
  id: string;
  name: string;
  address: string | null;
  is_active: boolean;
}

export interface VariantInput {
  attributes?: Record<string, string> | null;
  label?: string | null;
  default_threshold?: number | null;
}

/** `variant_attribute_labels` : au plus 2 libellés (ex. `["Format"]` ou
 * `["Taille", "Couleur"]`) — les variantes sont déclinées selon ces attributs.
 * `variants` vide → une variante par défaut (non déclinée) est créée par le
 * backend. */
export interface ArticleConfigCreate {
  unit?: string | null;
  purchase_price?: number | null;
  sale_price?: number | null;
  variant_attribute_labels?: string[] | null;
  lot_tracking_enabled: boolean;
  is_consigned: boolean;
  deposit_unit_amount?: number | null;
  variants: VariantInput[];
}

export interface ArticleConfigOut {
  id: string;
  record_id: string;
  unit: string | null;
  purchase_price: number | null;
  sale_price: number | null;
  variant_attribute_labels: string[] | null;
  lot_tracking_enabled: boolean;
  is_consigned: boolean;
  deposit_unit_amount: number | null;
}

export interface ArticleVariantOut {
  id: string;
  record_id: string;
  attributes: Record<string, string> | null;
  label: string | null;
  is_default: boolean;
  default_threshold: number | null;
}

export interface ArticleWithVariantsOut {
  config: ArticleConfigOut;
  variants: ArticleVariantOut[];
}

/** `depot_id: null` = seuil global de la variante, sinon seuil spécifique au dépôt. */
export interface ThresholdSet {
  depot_id?: string | null;
  threshold: number;
}

export interface DepotThresholdOut {
  depot_id: string;
  threshold: number;
}

// --- backend/app/models/stock.py:MovementType -------------------------------------------
export type MovementType = "entry" | "exit" | "transfer_out" | "transfer_in" | "adjustment";

export interface MovementCreate {
  client_operation_id?: string | null;
  variant_id: string;
  depot_id: string;
  quantity: number;
  reason?: string | null;
  supplier?: string | null;
  beneficiary?: string | null;
  cost_amount?: number | null;
  lot_number?: string | null;
  lot_expiry_date?: string | null; // AAAA-MM-JJ
  document_id?: string | null;
  note?: string | null;
}

/** `note` obligatoire — justification d'ajustement (cahier des charges §7.3). */
export interface AdjustmentCreate {
  client_operation_id?: string | null;
  variant_id: string;
  depot_id: string;
  counted_quantity: number;
  note: string;
}

export interface TransferCreate {
  client_operation_id?: string | null;
  variant_id: string;
  from_depot_id: string;
  to_depot_id: string;
  quantity: number;
  note?: string | null;
}

export interface MovementOut {
  id: string;
  client_operation_id: string | null;
  variant_id: string;
  depot_id: string;
  movement_type: MovementType;
  quantity_delta: number;
  reason: string | null;
  supplier: string | null;
  beneficiary: string | null;
  cost_amount: number | null;
  lot_number: string | null;
  lot_expiry_date: string | null; // AAAA-MM-JJ
  transfer_group_id: string | null;
  adjustment_counted_quantity: number | null;
  note: string | null;
  created_at: string; // ISO 8601 (datetime)
}

export interface MovementListOut {
  items: MovementOut[];
  total: number;
  limit: number;
  offset: number;
}

export interface StockLevelOut {
  id: string;
  variant_id: string;
  depot_id: string;
  quantity: number;
  updated_at: string; // ISO 8601 (datetime)
}

export interface StockLotOut {
  id: string;
  variant_id: string;
  depot_id: string;
  lot_number: string;
  expiry_date: string; // AAAA-MM-JJ
  remaining_quantity: number;
}

export type ConsignmentAction = "deliver_full" | "return_empty";

export interface ConsignmentActionCreate {
  variant_id: string;
  depot_id: string;
  action: ConsignmentAction;
  quantity: number;
  deposit_amount?: number | null;
}

export interface ConsignmentSummaryOut {
  variant_id: string;
  depot_id: string;
  full_count: number;
  empty_count: number;
  in_circulation_count: number;
  deposit_amount_collected: number;
}
