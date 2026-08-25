/**
 * Erreur typée pour tous les appels API. Le principe du playbook s'applique ici :
 * un échec est toujours un échec explicite, jamais un succès simulé. `ApiError`
 * porte assez d'information pour que l'UI affiche un message honnête (statut,
 * message renvoyé par le backend le cas échéant, ou "serveur injoignable").
 */
export class ApiError extends Error {
  readonly status: number;
  /** "network" quand la requête n'a même pas atteint le serveur. */
  readonly kind: "http" | "network";
  /**
   * Erreurs de validation par champ, quand le backend les fournit (fiches — voir
   * `backend/app/api/v1/routers/records.py:_validation_error_response`, forme
   * `{"detail": {"errors": {"cle_du_champ": "message"}}}`). Absent pour toutes les
   * autres erreurs (403, 404, réseau...) : ne pas supposer sa présence.
   */
  readonly fieldErrors?: Record<string, string>;

  constructor(
    message: string,
    status: number,
    kind: "http" | "network" = "http",
    fieldErrors?: Record<string, string>,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.kind = kind;
    this.fieldErrors = fieldErrors;
  }
}

export interface ParsedApiError {
  message: string;
  fieldErrors?: Record<string, string>;
}

/**
 * FastAPI renvoie `{"detail": "..."}` pour ses HTTPException simples,
 * `{"detail": [{"msg": "...", ...}, ...]}` pour les erreurs de validation Pydantic
 * (422 génériques), ou — spécifiquement pour la création/mise à jour de fiches —
 * `{"detail": {"errors": {"cle_du_champ": "message", ...}}}` (moteur de fiches,
 * voir `records.py:_validation_error_response`). On couvre les trois formes plutôt
 * que d'afficher une erreur générique qui masquerait le vrai message serveur.
 */
export async function parseErrorBody(response: Response): Promise<ParsedApiError> {
  try {
    const body: unknown = await response.clone().json();
    if (body && typeof body === "object" && "detail" in body) {
      const detail = (body as { detail: unknown }).detail;
      if (typeof detail === "string") return { message: detail };
      if (Array.isArray(detail)) {
        const messages = detail
          .map((item) =>
            item && typeof item === "object" && "msg" in item
              ? String((item as { msg: unknown }).msg)
              : null,
          )
          .filter((msg): msg is string => Boolean(msg));
        if (messages.length > 0) return { message: messages.join(" ") };
      }
      if (detail && typeof detail === "object" && "errors" in detail) {
        const rawErrors = (detail as { errors: unknown }).errors;
        if (rawErrors && typeof rawErrors === "object") {
          const fieldErrors: Record<string, string> = {};
          for (const [key, value] of Object.entries(rawErrors as Record<string, unknown>)) {
            if (typeof value === "string") fieldErrors[key] = value;
          }
          const firstMessage = Object.values(fieldErrors)[0];
          return {
            message: firstMessage ?? "Le formulaire contient des erreurs.",
            fieldErrors,
          };
        }
      }
    }
  } catch {
    // Le corps n'est pas du JSON exploitable : on retombe sur un message générique.
  }
  return { message: `Erreur ${response.status}.` };
}

/** Conservé pour les appels existants qui n'ont besoin que du message. */
export async function parseErrorDetail(response: Response): Promise<string> {
  return (await parseErrorBody(response)).message;
}
