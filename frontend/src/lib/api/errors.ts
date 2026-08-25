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

  constructor(message: string, status: number, kind: "http" | "network" = "http") {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.kind = kind;
  }
}

/**
 * FastAPI renvoie `{"detail": "..."}` pour ses HTTPException (voir tous les routers
 * de backend/app/api/v1/routers/*.py) ou `{"detail": [{"msg": "...", ...}, ...]}`
 * pour les erreurs de validation Pydantic (422). On couvre les deux formes plutôt
 * que d'afficher une erreur générique qui masquerait le vrai message serveur.
 */
export async function parseErrorDetail(response: Response): Promise<string> {
  try {
    const body: unknown = await response.clone().json();
    if (body && typeof body === "object" && "detail" in body) {
      const detail = (body as { detail: unknown }).detail;
      if (typeof detail === "string") return detail;
      if (Array.isArray(detail)) {
        const messages = detail
          .map((item) =>
            item && typeof item === "object" && "msg" in item
              ? String((item as { msg: unknown }).msg)
              : null,
          )
          .filter((msg): msg is string => Boolean(msg));
        if (messages.length > 0) return messages.join(" ");
      }
    }
  } catch {
    // Le corps n'est pas du JSON exploitable : on retombe sur un message générique.
  }
  return `Erreur ${response.status}.`;
}
