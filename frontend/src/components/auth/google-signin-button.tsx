"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Script from "next/script";
import { useTheme } from "next-themes";

/**
 * Intégration réelle de "Continuer avec Google" (§4.4) via Google Identity
 * Services — pas une simulation. Sans `NEXT_PUBLIC_GOOGLE_CLIENT_ID`, on affiche
 * un état "non configuré" honnête (voir frontend/README.md) plutôt qu'un bouton
 * qui prétendrait fonctionner.
 */
declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential: string }) => void;
            ux_mode?: "popup" | "redirect";
          }) => void;
          renderButton: (
            parent: HTMLElement,
            options: {
              theme?: "outline" | "filled_blue" | "filled_black";
              size?: "large" | "medium" | "small";
              text?: "signin_with" | "signup_with" | "continue_with";
              shape?: "rectangular" | "pill";
              logo_alignment?: "left" | "center";
              width?: number;
            },
          ) => void;
        };
      };
    };
  }
}

const GSI_SRC = "https://accounts.google.com/gsi/client";
const BUTTON_WIDTH = 360;

interface GoogleSignInButtonProps {
  mode: "signin" | "signup";
  onCredential: (idToken: string) => void;
  disabled?: boolean;
}

export function GoogleSignInButton({ mode, onCredential, disabled }: GoogleSignInButtonProps) {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  const containerRef = useRef<HTMLDivElement>(null);
  const { resolvedTheme } = useTheme();
  const [scriptState, setScriptState] = useState<"loading" | "ready" | "error">("loading");
  const [rendered, setRendered] = useState(false);

  const render = useCallback(() => {
    if (!clientId || !containerRef.current || !window.google?.accounts?.id) return;
    containerRef.current.innerHTML = "";
    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: (response) => onCredential(response.credential),
      ux_mode: "popup",
    });
    window.google.accounts.id.renderButton(containerRef.current, {
      theme: resolvedTheme === "dark" ? "filled_black" : "outline",
      size: "large",
      shape: "pill",
      text: mode === "signup" ? "signup_with" : "signin_with",
      logo_alignment: "left",
      width: BUTTON_WIDTH,
    });
    setRendered(true);
  }, [clientId, mode, onCredential, resolvedTheme]);

  useEffect(() => {
    if (scriptState === "ready") render();
  }, [scriptState, render]);

  if (!clientId) {
    return (
      <div
        role="status"
        className="flex w-full items-center justify-center rounded-full border border-dashed border-border bg-muted/40 px-4 py-2.5 text-center text-sm text-muted-foreground"
      >
        Connexion Google non configurée sur cet environnement.
      </div>
    );
  }

  return (
    <div
      className={
        "relative flex w-full justify-center" + (disabled ? " pointer-events-none opacity-60" : "")
      }
      style={{ minHeight: 40 }}
    >
      <Script
        src={GSI_SRC}
        strategy="afterInteractive"
        onReady={() => setScriptState("ready")}
        onError={() => setScriptState("error")}
      />
      <div ref={containerRef} />
      {!rendered && scriptState !== "error" ? (
        <div
          aria-hidden
          className="absolute inset-0 flex items-center justify-center rounded-full border border-border bg-background text-sm text-muted-foreground"
        >
          Chargement de Google…
        </div>
      ) : null}
      {scriptState === "error" ? (
        <div
          role="alert"
          className="absolute inset-0 flex items-center justify-center rounded-full border border-destructive/30 bg-destructive/5 px-3 text-center text-sm text-destructive"
        >
          Google est injoignable. Utilisez l&apos;e-mail ci-dessous.
        </div>
      ) : null}
    </div>
  );
}
