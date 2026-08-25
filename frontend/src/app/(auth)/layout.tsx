import type { ReactNode } from "react";
import Link from "next/link";
import { CloudOff, ShieldCheck, Zap } from "lucide-react";

import { Logo } from "@/components/brand/logo";
import { AuthPanelBackground } from "@/components/brand/auth-panel-background";
import { ThemeToggle } from "@/components/theme-toggle";

// Trois capacités réellement livrées (jamais un argument marketing inventé,
// voir playbook §7 "inventer du contenu : jamais") — reprises telles quelles
// du reste du produit plutôt que rédigées pour l'occasion.
const FEATURES = [
  { icon: Zap, text: "Alertes automatiques avant chaque échéance" },
  { icon: CloudOff, text: "Fonctionne hors connexion, se synchronise seul" },
  { icon: ShieldCheck, text: "Chaque organisation cloisonnée, données jamais mélangées" },
];

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
      {/* Panneau de marque — masqué sous lg, c'est la coquille elle-même qui
          porte la lueur de fond en dessous de ce seuil (voir plus bas). */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-veil px-12 py-10 text-white lg:flex">
        <AuthPanelBackground />
        <Link href="/" aria-label="Registre — accueil" className="relative z-10 w-fit transition-opacity hover:opacity-80">
          <Logo wordmarkClassName="text-white" />
        </Link>
        <div className="relative z-10 max-w-md space-y-8">
          <p className="font-heading text-3xl leading-tight font-semibold text-balance">
            Le socle unique pour suivre vos actifs et vos stocks.
          </p>
          <ul className="space-y-3.5">
            {FEATURES.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-sm text-white/75">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white/10 ring-1 ring-white/15">
                  <Icon className="size-4" />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative z-10 text-xs text-white/40">
          Registre — gestion d&apos;actifs et de stocks pour PME.
        </p>
      </div>

      <div className="relative flex flex-col bg-background lg:overflow-y-auto">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 overflow-hidden lg:hidden"
          style={{
            backgroundImage:
              "radial-gradient(circle at 12% 18%, color-mix(in oklch, var(--primary), transparent 88%), transparent 45%), radial-gradient(circle at 88% 78%, color-mix(in oklch, var(--gold), transparent 90%), transparent 50%)",
          }}
        />
        <header className="relative z-10 flex items-center justify-between px-6 py-5 sm:px-10">
          <Link href="/" aria-label="Registre — accueil" className="transition-opacity hover:opacity-80 lg:hidden">
            <Logo />
          </Link>
          <span className="hidden lg:block" />
          <ThemeToggle />
        </header>
        <main className="relative z-10 flex flex-1 items-center justify-center px-4 pb-16 sm:px-6">
          {children}
        </main>
        <footer className="relative z-10 px-6 pb-6 text-center text-xs text-muted-foreground lg:hidden">
          Registre — gestion d&apos;actifs et de stocks pour PME.
        </footer>
      </div>
    </div>
  );
}
