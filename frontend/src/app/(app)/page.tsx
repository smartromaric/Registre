"use client";

import { motion, useReducedMotion } from "framer-motion";
import { PackageSearch } from "lucide-react";

import { useAuth } from "@/lib/auth/auth-context";
import { formatDate } from "@/lib/format";
import { ROLE_LABELS } from "@/lib/roles";

/**
 * Coquille du tableau de bord : prouve que l'authentification et le
 * cloisonnement par organisation fonctionnent bout en bout. Le vrai contenu
 * (§10.1 PRODUCT.md — "qu'est-ce qui demande mon attention aujourd'hui")
 * arrive avec le lot 1 (moteur de fiches) : on ne construit pas un faux
 * tableau de bord avec des chiffres inventés en attendant.
 */
export default function AppHomePage() {
  const reduceMotion = useReducedMotion();
  const { user, currentOrganization } = useAuth();
  const firstName = user?.full_name.split(" ")[0] ?? "";

  return (
    <motion.div
      initial={reduceMotion ? undefined : { opacity: 0, y: 8 }}
      animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="flex flex-col gap-8"
    >
      <div>
        <h1 className="font-heading text-2xl font-semibold text-foreground sm:text-3xl">
          Bonjour {firstName}
        </h1>
        {currentOrganization ? (
          <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{currentOrganization.name}</span>
            <span aria-hidden>·</span>
            <span>{ROLE_LABELS[currentOrganization.my_role]}</span>
            <span aria-hidden>·</span>
            <span>Essai jusqu&apos;au {formatDate(currentOrganization.trial_ends_at)}</span>
          </p>
        ) : null}
      </div>

      <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-muted/30 px-6 py-20 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <PackageSearch className="size-6" />
        </span>
        <h2 className="font-heading text-lg font-medium text-foreground">
          Le tableau de bord arrive avec le prochain lot
        </h2>
        <p className="max-w-sm text-sm text-muted-foreground">
          L&apos;authentification, le cloisonnement par organisation et la navigation entre
          organisations sont en place. Fiches, stock, échéances et tableaux de bord seront
          construits par-dessus ces fondations.
        </p>
      </div>
    </motion.div>
  );
}
