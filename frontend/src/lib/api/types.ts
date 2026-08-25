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
  totp_enabled: boolean;
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

/** POST .../members (§4.4) — réservé à l'ADMIN de l'organisation côté backend. */
export interface MembershipInvite {
  email: string;
  full_name: string;
  role: OrgRole;
  can_view_amounts?: boolean;
}

/** PATCH .../members/{id} — réservé à l'ADMIN, même règle que `MembershipInvite`. */
export interface MembershipUpdate {
  role?: OrgRole | null;
  can_view_amounts?: boolean | null;
  is_active?: boolean | null;
}

export interface MembershipInviteOut {
  membership: MembershipOut;
  invitation_email_sent: boolean;
  /** Rempli seulement quand un e-mail devait être envoyé mais que le SMTP n'est
   * pas configuré côté serveur — le membre est créé quand même, ce lien doit
   * alors être transmis à la main (voir `components/members/invite-member-dialog.tsx`). */
  invitation_link: string | null;
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

/** Réponse de `POST /auth/login` — forme volontairement plus large qu'`AuthResponse`
 * pour porter les deux issues possibles : `requires_2fa: false` (l'immense majorité
 * des comptes) laisse `tokens`/`user` toujours renseignés exactement comme
 * `AuthResponse` ; `requires_2fa: true` les laisse `null` et fournit
 * `challenge_token` à la place, à soumettre avec le code à `POST /auth/2fa/verify`.
 * Pas encore consommé par l'écran de connexion (2FA pas encore câblée côté
 * interface) — géré défensivement dans `app/api/auth/_lib/forward.ts` pour ne
 * jamais planter sur `tokens` nul le jour où un compte l'active. */
export interface LoginResult {
  requires_2fa: boolean;
  challenge_token: string | null;
  tokens: TokenPairOut | null;
  user: UserOut | null;
  is_new_user: boolean;
}

// --- mot de passe oublié (§4.4 raffinement) ---------------------------------------------

export interface ForgotPasswordRequest {
  email: string;
}

export interface ResetPasswordRequest {
  token: string;
  password: string;
}

// --- acceptation d'invitation par e-mail (§4.4) -----------------------------------------

/** Ce qu'une page d'acceptation d'invitation affiche avant de demander un mot de
 * passe — jamais le jeton lui-même, il reste dans l'URL côté client. */
export interface InvitationInfoOut {
  email: string;
  organization_name: string;
  already_active: boolean;
}

export interface InvitationAcceptRequest {
  token: string;
  password: string;
  full_name?: string | null;
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

// =========================================================================
// Module Tableaux de bord (cahier des charges §10) — mode ADDITIF, ne pas
// toucher aux types ci-dessus. Miroir exact de backend/app/schemas/dashboard.py.
// =========================================================================

// --- backend/app/models/dashboard.py:DashboardPeriod -------------------------------
export type DashboardPeriod = "7d" | "30d" | "90d" | "current_year";

export interface DashboardScope {
  model_definition_id: string | null;
  model_name: string | null;
  nature: RecordNature | null;
  depot_id: string | null;
  depot_name: string | null;
  site: string | null;
  period: DashboardPeriod;
  period_start: string; // AAAA-MM-JJ
  period_end: string; // AAAA-MM-JJ
}

/** §10.1 : les quatre indicateurs "qu'est-ce qui demande mon attention
 * aujourd'hui", dans cet ordre. Seulement pour le périmètre global — §10.2
 * les remplace par des indicateurs propres à la nature du modèle focalisé. */
export interface AttentionCounters {
  overdue_deadlines_count: number;
  upcoming_deadlines_count: number;
  understock_articles_count: number;
  expiring_lots_count: number;
}

/** Compteurs de synthèse globaux, affichés après les indicateurs d'attention. */
export interface SummaryCounters {
  total_records: number;
  /** `null` si l'utilisateur n'a pas le droit de voir les montants (§4.2) —
   * ne jamais afficher "0" dans ce cas, omettre la tuile côté UI. */
  total_stock_value: number | null;
}

export interface MonthCount {
  month: string; // "2026-06"
  count: number;
}

export interface MonthAmount {
  month: string;
  amount: number;
}

export interface StatusCount {
  status: string;
  count: number;
}

/** §10.3, ligne "Actif suivi". */
export interface AssetIndicators {
  fiche_count: number;
  status_breakdown: StatusCount[];
  overdue_deadlines_count: number;
  upcoming_deadlines_count: number;
  event_cost_total: number | null;
  upcoming_deadlines_by_month: MonthCount[];
  event_cost_by_month: MonthAmount[] | null;
}

export interface VariantQuantity {
  variant_id: string;
  label: string;
  quantity: number;
}

export interface DepotQuantity {
  depot_id: string;
  depot_name: string;
  quantity: number;
}

export interface DayMovements {
  day: string; // AAAA-MM-JJ
  entries_quantity: number;
  exits_quantity: number;
}

/** §10.3, ligne "Article de stock". */
export interface StockIndicators {
  total_quantity: number;
  understock_articles_count: number;
  stock_value: number | null;
  entries_quantity_period: number;
  exits_quantity_period: number;
  expiring_lots_count: number;
  stock_by_variant: VariantQuantity[];
  stock_by_depot: DepotQuantity[];
  movements_by_day: DayMovements[];
}

export interface DashboardOut {
  scope: DashboardScope;
  attention: AttentionCounters | null;
  summary: SummaryCounters | null;
  asset: AssetIndicators | null;
  stock: StockIndicators | null;
}

// --- listes "cliquables" derrière chaque indicateur (§10.5) -------------------------

export interface DeadlineHitOut {
  record_id: string;
  model_definition_id: string;
  model_name: string;
  record_title: string;
  field_key: string;
  field_label: string;
  due_date: string; // AAAA-MM-JJ
  days_overdue: number; // négatif si l'échéance n'est pas encore atteinte
}

export interface UnderstockHitOut {
  record_id: string;
  model_name: string;
  record_title: string;
  variant_id: string;
  variant_label: string;
  depot_id: string;
  depot_name: string;
  quantity: number;
  threshold: number;
}

export interface ExpiringLotHitOut {
  record_id: string;
  model_name: string;
  record_title: string;
  variant_id: string;
  variant_label: string;
  depot_id: string;
  depot_name: string;
  lot_number: string;
  expiry_date: string; // AAAA-MM-JJ
  remaining_quantity: number;
}

export interface DeadlineHitListOut {
  items: DeadlineHitOut[];
  total: number;
  limit: number;
  offset: number;
}

export interface UnderstockHitListOut {
  items: UnderstockHitOut[];
  total: number;
  limit: number;
  offset: number;
}

export interface ExpiringLotHitListOut {
  items: ExpiringLotHitOut[];
  total: number;
  limit: number;
  offset: number;
}

// --- tableaux de bord enregistrés et épinglés (§10.4) -------------------------------

export interface SavedDashboardCreate {
  name: string;
  model_definition_id?: string | null;
  depot_id?: string | null;
  site?: string | null;
  period?: DashboardPeriod;
}

export interface SavedDashboardUpdate {
  name?: string | null;
  model_definition_id?: string | null;
  depot_id?: string | null;
  site?: string | null;
  period?: DashboardPeriod | null;
  is_pinned?: boolean | null;
}

export interface SavedDashboardOut {
  id: string;
  name: string;
  model_definition_id: string | null;
  depot_id: string | null;
  site: string | null;
  period: DashboardPeriod;
  is_pinned: boolean;
}

// =========================================================================
// Module Abonnements (cahier des charges §12) et Espace éditeur (§13) — mode
// ADDITIF, ne pas toucher aux types ci-dessus. Miroir exact de
// backend/app/schemas/subscription.py. Deux surfaces distinctes partagent ces
// types : l'écran d'abonnement de l'organisation (ADMIN de l'organisation) et
// l'espace éditeur (`User.is_platform_admin`, rôle de plateforme sans rapport
// avec `OrgRole` — voir lib/roles.ts).
// =========================================================================

// --- backend/app/models/subscription.py:SubscriptionStatus -------------------------
export type SubscriptionStatus = "trial" | "active" | "read_only" | "suspended" | "archived";

// --- backend/app/models/subscription.py:PaymentStatus ------------------------------
export type PaymentStatus = "declared" | "validated" | "rejected";

// --- backend/app/models/subscription.py:PaymentMethod ------------------------------
export type PaymentMethod = "mobile_money" | "bank_transfer" | "cash" | "other";

// --- catalogue (offres/devises) : GET /catalog/offers, /catalog/currencies (tout
// utilisateur connecté, actives uniquement) ; GET/POST/PATCH sur /editor/offers,
// /editor/currencies réservés à l'éditeur (toutes, y compris désactivées) ---

export interface OfferCreate {
  name: string;
  duration_months: number;
  storage_quota_gb: number;
  /** `null` = illimité (§12.1). */
  user_quota?: number | null;
  /** Un prix par devise acceptée, ex. `{"XAF": 5000, "EUR": 12}`. */
  prices?: Record<string, number>;
  is_active?: boolean;
  is_featured?: boolean;
}

export interface OfferUpdate {
  name?: string | null;
  duration_months?: number | null;
  storage_quota_gb?: number | null;
  user_quota?: number | null;
  prices?: Record<string, number> | null;
  is_active?: boolean | null;
  is_featured?: boolean | null;
}

export interface OfferOut {
  id: string;
  name: string;
  duration_months: number;
  storage_quota_gb: number;
  user_quota: number | null;
  prices: Record<string, number>;
  is_active: boolean;
  is_featured: boolean;
}

export interface CurrencyCreate {
  code: string;
  display_format?: string;
  is_active?: boolean;
}

export interface CurrencyUpdate {
  display_format?: string | null;
  is_active?: boolean | null;
}

export interface CurrencyOut {
  id: string;
  code: string;
  display_format: string;
  is_active: boolean;
}

// --- abonnement d'une organisation -------------------------------------------------

export interface SubscriptionOut {
  id: string;
  organization_id: string;
  offer_id: string | null;
  status: SubscriptionStatus;
  current_period_end: string; // ISO 8601 (datetime)
  read_only_since: string | null;
  suspended_since: string | null;
}

/** §13 : prolonger/suspendre/réactiver à la main, motif obligatoire — inscrit
 * au journal d'audit. */
export interface SubscriptionAdminAdjust {
  new_status?: SubscriptionStatus | null;
  new_period_end?: string | null; // ISO 8601 (datetime)
  reason: string;
}

// --- règlements ----------------------------------------------------------------------

export interface PaymentDeclare {
  offer_id: string;
  declared_amount: number;
  declared_reference: string;
}

export interface PaymentValidate {
  validated_amount: number;
  currency_code: string;
  method: PaymentMethod;
  validated_reference?: string | null;
}

export interface PaymentReject {
  reason: string;
}

/** §12.4 : l'éditeur enregistre un paiement sans demande préalable. */
export interface PaymentRecordManual {
  organization_id: string;
  offer_id: string;
  validated_amount: number;
  currency_code: string;
  method: PaymentMethod;
  validated_reference?: string | null;
}

export interface PaymentOut {
  id: string;
  organization_id: string;
  offer_id: string;
  status: PaymentStatus;
  declared_amount: number | null;
  declared_reference: string | null;
  validated_amount: number | null;
  currency_code: string | null;
  method: PaymentMethod | null;
  validated_reference: string | null;
  validated_at: string | null;
  rejection_reason: string | null;
  created_at: string; // ISO 8601 (datetime)
}

export interface InvoiceOut {
  id: string;
  organization_id: string;
  payment_id: string;
  number: string;
  amount: number;
  currency_code: string;
  period_start: string; // AAAA-MM-JJ
  period_end: string; // AAAA-MM-JJ
  issued_at: string; // ISO 8601 (datetime)
}

/** §13 : liste des organisations côté éditeur. `offer_name` est toujours
 * `null` côté backend à ce jour (lacune connue, pas à contourner côté client
 * — afficher un tiret plutôt que "null"). */
export interface OrganizationSummaryOut {
  organization_id: string;
  name: string;
  country_code: string;
  created_at: string; // ISO 8601 (datetime)
  subscription_status: SubscriptionStatus;
  offer_name: string | null;
  current_period_end: string; // ISO 8601 (datetime)
  member_count: number;
}

/** Forme ad hoc de POST /editor/subscriptions/run-lifecycle-scan (pas un schéma
 * Pydantic nommé côté backend — voir editor.py:run_lifecycle_scan). */
export interface LifecycleTransition {
  organization_id: string;
  from: SubscriptionStatus;
  to: SubscriptionStatus;
}

export interface LifecycleScanResult {
  transitions: LifecycleTransition[];
}

// =========================================================================
// Recherche globale (cahier des charges §9) — mode ADDITIF, ne pas toucher aux
// types ci-dessus. Miroir exact de backend/app/schemas/search.py.
// =========================================================================

/** Un résultat de `GET .../search` : `model_name` permet de distinguer des
 * fiches de modèles différents quand rien d'autre ne les différencie (ex. le
 * champ "Lien vers une fiche", qui ne restreint la recherche à aucun modèle
 * précis — voir `RecordLinkFieldControl` dans `field-renderer.tsx`). */
export interface SearchHitOut {
  record_id: string;
  model_definition_id: string;
  model_name: string;
  title: string;
}
