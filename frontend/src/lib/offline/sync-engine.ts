/**
 * Relecture de la file d'opérations hors-ligne (cahier des charges §11.3,
 * PRODUCT.md §10.11). Séquentiel et strictement dans l'ordre `createdAt` — une
 * mise à jour ne doit jamais être rejouée avant la création dont elle dépend.
 *
 * Pas de Background Sync API (choix explicite, voir PRODUCT.md §10.11) : la
 * relecture n'a lieu que pendant que l'application est ouverte et en ligne —
 * déclenchée par `use-offline-sync.ts`.
 */

import { toast } from "sonner";

import { ApiError } from "@/lib/api/errors";
import { createRecord, updateRecord } from "@/lib/api/records";
import {
  createAdjustmentMovement,
  createEntryMovement,
  createExitMovement,
  createTransferMovement,
} from "@/lib/api/stock";
import type { AdjustmentCreate, MovementCreate, TransferCreate } from "@/lib/api/types";
import {
  listOperations,
  putCachedRecord,
  removeOperation,
  resetStaleSyncingOperations,
  updateOperationStatus,
  type QueueOperation,
} from "./db";
import { resumeUpload } from "./uploads";

async function runOperation(op: QueueOperation, accessToken: string): Promise<void> {
  switch (op.kind) {
    case "record.create": {
      const { payload } = op;
      const saved = await createRecord(accessToken, op.organizationId, payload.modelId, {
        id: payload.recordId,
        data: payload.data,
        status: payload.status,
        site: payload.site,
        assigned_person_record_id: payload.assigned_person_record_id,
      });
      await putCachedRecord({
        id: saved.id,
        organizationId: op.organizationId,
        modelId: saved.model_definition_id,
        data: saved,
        cachedAt: new Date().toISOString(),
      });
      return;
    }
    case "record.update": {
      const { payload } = op;
      const saved = await updateRecord(accessToken, op.organizationId, payload.recordId, {
        data: payload.data,
        status: payload.status,
        site: payload.site,
        assigned_person_record_id: payload.assigned_person_record_id,
        client_operation_id: op.id,
        field_written_at: payload.fieldWrittenAt,
      });
      await putCachedRecord({
        id: saved.id,
        organizationId: op.organizationId,
        modelId: saved.model_definition_id,
        data: saved,
        cachedAt: new Date().toISOString(),
      });
      if (saved.conflicted_field_keys.length > 0) {
        // Rien de plus qu'un toast ici — le détail (deux valeurs, deux
        // horodatages) vit dans le journal (/organisation/conflits, §G).
        toast.warning(
          `Une modification enregistrée hors connexion sur « ${saved.conflicted_field_keys.join(" », « ")} » a été remplacée par une saisie plus récente. Voir Organisation → Conflits de synchronisation.`,
        );
      }
      return;
    }
    case "stock.movement": {
      const { kind, body } = op.payload;
      if (kind === "entry") await createEntryMovement(accessToken, op.organizationId, body as MovementCreate);
      else if (kind === "exit") await createExitMovement(accessToken, op.organizationId, body as MovementCreate);
      else if (kind === "adjustment")
        await createAdjustmentMovement(accessToken, op.organizationId, body as AdjustmentCreate);
      else await createTransferMovement(accessToken, op.organizationId, body as TransferCreate);
      return;
    }
    case "document.upload": {
      await resumeUpload(op.payload.uploadSessionId, accessToken);
      return;
    }
  }
}

export async function runSyncPass(
  accessToken: string,
  refreshAccessToken: () => Promise<string | null>,
): Promise<void> {
  let token = accessToken;
  // Une opération encore "syncing" au tout début d'une passe ne peut provenir
  // que d'une passe précédente interrompue en plein vol (onglet fermé, appli
  // tuée par le système avant que la requête réseau n'aboutisse) — rien d'autre
  // ne peut la laisser dans cet état, `useOfflineSync` empêchant deux passes
  // concurrentes dans le même onglet. Sans cette remise à zéro, une telle
  // opération restait exclue de `listOperations()` pour toujours : ni rejouée,
  // ni comptée par `countPendingOperations`, ni jamais marquée "failed" —
  // silencieusement invisible. Rejouer sans effet grâce à `client_operation_id`
  // / l'id de fiche généré côté client (§11.4) rend cette remise à zéro sûre
  // même si la requête interrompue avait en fait abouti côté serveur.
  await resetStaleSyncingOperations();
  const ops = (await listOperations()).filter((op) => op.status !== "failed");

  for (const op of ops) {
    await updateOperationStatus(op.id, "syncing");
    try {
      await runOperation(op, token);
      await removeOperation(op.id);
      continue;
    } catch (err) {
      if (err instanceof ApiError && err.kind === "http" && err.status === 401) {
        const refreshed = await refreshAccessToken();
        if (refreshed) {
          token = refreshed;
          try {
            await runOperation(op, token);
            await removeOperation(op.id);
            continue;
          } catch (retryErr) {
            if (retryErr instanceof ApiError && retryErr.kind === "network") {
              await updateOperationStatus(op.id, "pending");
              return;
            }
            const message = retryErr instanceof ApiError ? retryErr.message : "Erreur inconnue.";
            await updateOperationStatus(op.id, "failed", message);
            toast.error(`Une opération hors connexion a échoué et nécessite votre attention : ${message}`);
            return;
          }
        }
        // Le jeton est mort et le rafraîchissement a échoué : inutile de
        // brûler les opérations suivantes avec un jeton qu'on sait invalide —
        // elles restent "pending" pour la prochaine passe (prochaine connexion).
        await updateOperationStatus(op.id, "failed", err.message);
        return;
      }

      if (err instanceof ApiError && err.kind === "network") {
        // Reperdu le réseau en cours de passe : état normal, pas un échec —
        // remise "pending", et inutile de tenter les suivantes maintenant.
        await updateOperationStatus(op.id, "pending");
        return;
      }

      // Erreur définitive (ex. 422 de validation) : ne bloque pas les autres
      // opérations en file, mais pas de file "échouées" à consulter dans ce
      // lot (hors périmètre, voir le brief) — juste ce toast, une fois.
      const message = err instanceof ApiError ? err.message : "Erreur inconnue.";
      await updateOperationStatus(op.id, "failed", message);
      toast.error(`Une opération hors connexion a échoué et nécessite votre attention : ${message}`);
    }
  }
}
