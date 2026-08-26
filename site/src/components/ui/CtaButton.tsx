import type { ReactNode } from "react";

type Variant = "primary" | "ghost" | "outline";

const BASE =
  "group relative inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-medium " +
  "transition-[transform,box-shadow,background-color,border-color] duration-300 ease-[var(--ease-out-soft)] " +
  "hover:-translate-y-0.5 active:translate-y-0";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-primary text-primary-fg shadow-[0_10px_30px_-10px_color-mix(in_oklch,var(--color-primary),transparent_35%)] " +
    "hover:shadow-[0_18px_44px_-12px_color-mix(in_oklch,var(--color-primary),transparent_25%)]",
  ghost: "border border-line bg-veil/[0.04] text-fg hover:border-primary/50 hover:bg-veil/[0.08]",
  outline: "border border-primary/60 text-primary hover:bg-primary/10",
};

/**
 * Un lien, pas un bouton — playbook §6 : « les liens qui n'en sont pas doivent
 * être des `<button>` », et réciproquement. Tous les appels à l'action du site
 * mènent quelque part, ce sont donc des ancres, avec la sémantique qui va avec.
 */
export function CtaButton({
  href,
  children,
  variant = "primary",
  className = "",
}: {
  href: string;
  children: ReactNode;
  variant?: Variant;
  className?: string;
}) {
  return (
    <a href={href} className={`${BASE} ${VARIANTS[variant]} ${className}`}>
      {children}
    </a>
  );
}
