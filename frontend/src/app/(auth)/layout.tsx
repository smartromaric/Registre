import type { ReactNode } from "react";
import Link from "next/link";

import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme-toggle";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-dvh flex-col bg-background">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-hidden"
        style={{
          backgroundImage:
            "radial-gradient(circle at 12% 18%, color-mix(in oklch, var(--primary), transparent 88%), transparent 45%), radial-gradient(circle at 88% 78%, color-mix(in oklch, var(--gold), transparent 90%), transparent 50%)",
        }}
      />
      <header className="relative z-10 flex items-center justify-between px-6 py-5 sm:px-10">
        <Link href="/" aria-label="Registre — accueil" className="transition-opacity hover:opacity-80">
          <Logo />
        </Link>
        <ThemeToggle />
      </header>
      <main className="relative z-10 flex flex-1 items-center justify-center px-4 pb-16 sm:px-6">
        {children}
      </main>
      <footer className="relative z-10 px-6 pb-6 text-center text-xs text-muted-foreground">
        Registre — gestion d&apos;actifs et de stocks pour PME.
      </footer>
    </div>
  );
}
