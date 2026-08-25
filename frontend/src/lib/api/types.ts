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
