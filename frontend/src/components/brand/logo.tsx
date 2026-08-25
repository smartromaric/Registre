import { cn } from "@/lib/utils";

interface LogoProps {
  className?: string;
  withWordmark?: boolean;
  size?: "sm" | "md";
}

/** Monogramme + nom de marque. Une icône géométrique abstraite (repère/étiquette de
 * registre), jamais une figure dessinée — voir playbook §7 sur les pièges du SVG figuratif. */
export function Logo({ className, withWordmark = true, size = "md" }: LogoProps) {
  const boxSize = size === "sm" ? "size-7" : "size-8";
  const iconSize = size === "sm" ? "size-3.5" : "size-4";
  const textSize = size === "sm" ? "text-base" : "text-lg";

  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <span
        className={cn(
          "relative flex shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm",
          boxSize,
        )}
      >
        <svg viewBox="0 0 24 24" className={iconSize} fill="none" aria-hidden="true">
          <path
            d="M5 4.5A1.5 1.5 0 0 1 6.5 3h11A1.5 1.5 0 0 1 19 4.5v16.19a.5.5 0 0 1-.79.407L12 16.7l-6.21 4.396A.5.5 0 0 1 5 20.69z"
            fill="currentColor"
          />
        </svg>
        <span
          className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-gold ring-2 ring-[var(--card)]"
          aria-hidden="true"
        />
      </span>
      {withWordmark ? (
        <span className={cn("font-heading font-semibold tracking-tight text-foreground", textSize)}>
          Registre
        </span>
      ) : null}
    </span>
  );
}
