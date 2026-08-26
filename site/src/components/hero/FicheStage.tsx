"use client";

import { useEffect, useImperativeHandle, useMemo, useRef, type Ref } from "react";

import { SCATTER_COUNT, clamp01, easeInOut, easeOut, lerp, phaseProgress } from "@/lib/config";
import { content } from "@/lib/content";
import { typo } from "@/lib/typography";

/**
 * L'objet unique — playbook §3, « un seul objet, plusieurs états ».
 *
 * Il n'y a pas six visuels pour six moments : il y a UNE fiche, et le scroll la
 * traverse. Les feuillets épars, la fiche remplie, l'échéance qui mûrit, l'alerte
 * qui s'envole, la coupure réseau et la bibliothèque sont six états du même objet.
 *
 * Ce composant sait *comment peindre* un état. Il ne décide jamais *quand* :
 * `render()` n'a qu'un seul appelant, la boucle de `Hero.tsx`.
 */

export type StageHandle = {
  /** Peint l'objet pour une progression de hero donnée (0 → 1). */
  render(heroProgress: number): void;
};

/**
 * Repère logique fixe. Toute la mise en scène est calculée dans ce système de
 * coordonnées, puis le conteneur est mis à l'échelle une fois pour tenir dans la
 * fenêtre. Sans cela, chaque valeur devrait dépendre de la taille d'écran et la
 * chronologie deviendrait impossible à régler — et à tester.
 */
const STAGE_W = 880;
const STAGE_H = 560;

/**
 * Le cadrage serré : la place réellement occupée par la fiche et son alerte.
 *
 * La scène n'a besoin de ses 880 px de large qu'à la toute fin, quand la
 * bibliothèque se déploie. Cadrer tout le récit sur cette largeur laissait la
 * fiche petite et perdue au milieu du vide — visible sur la planche. La caméra
 * reste donc serrée, puis RECULE pendant `library`. Le mouvement fait le travail
 * d'une révélation, et il ne coûte qu'une interpolation.
 */
const NEAR_W = 620;
const NEAR_H = 500;

const CARD_W = 392;

/** Disposition de la bibliothèque : 3 colonnes × 2 rangées, centrée sur l'origine. */
const TILE_W = 256;
const TILE_H = 140;
const TILE_SLOTS = [
  { x: -276, y: -82 },
  { x: 0, y: -82 },
  { x: 276, y: -82 },
  { x: -276, y: 82 },
  { x: 0, y: 82 },
  { x: 276, y: 82 },
];

const RING_R = 15;
const RING_C = 2 * Math.PI * RING_R;

/**
 * Pseudo-aléatoire déterministe. `Math.random()` produirait une disposition
 * différente au rendu serveur et au rendu client — donc une erreur d'hydratation,
 * et surtout une mise en scène non reproductible d'un test à l'autre.
 */
function rand(i: number, salt: number): number {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

type Sheet = {
  x: number;
  y: number;
  rot: number;
  restX: number;
  restY: number;
  restRot: number;
  delay: number;
  lines: number;
};

function buildSheets(): Sheet[] {
  return Array.from({ length: SCATTER_COUNT }, (_, i) => {
    const angle = rand(i, 1) * Math.PI * 2;
    const radius = 300 + rand(i, 2) * 460;
    return {
      x: Math.cos(angle) * radius * 1.35,
      y: Math.sin(angle) * radius * 0.75,
      rot: (rand(i, 3) - 0.5) * 90,
      // Position de repos : la pile résiduelle derrière la fiche, qui donne la profondeur.
      restX: (rand(i, 4) - 0.5) * 30,
      restY: (rand(i, 5) - 0.5) * 22,
      restRot: (rand(i, 6) - 0.5) * 11,
      delay: rand(i, 7),
      lines: 3 + Math.floor(rand(i, 8) * 3),
    };
  });
}

const card = content.hero.card;
/** Les quatre champs ordinaires, puis l'échéance qui est traitée à part. */
const ROW_COUNT = card.rows.length + 1;

export function FicheStage({ ref }: { ref: Ref<StageHandle> }) {
  const sheets = useMemo(() => buildSheets(), []);

  const sheetRefs = useRef<(HTMLDivElement | null)[]>([]);
  const stackRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);
  const valueRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const deadlineRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<SVGCircleElement>(null);
  const countdownRef = useRef<HTMLSpanElement>(null);
  const alertRef = useRef<HTMLDivElement>(null);
  const connRef = useRef<HTMLDivElement>(null);
  const connDotRef = useRef<HTMLSpanElement>(null);
  const connLabelRef = useRef<HTMLSpanElement>(null);
  const queueRef = useRef<HTMLSpanElement>(null);
  const tileRefs = useRef<(HTMLDivElement | null)[]>([]);
  const canvasRef = useRef<HTMLDivElement>(null);
  /**
   * Dimensions du conteneur, tenues à jour par un `ResizeObserver`.
   *
   * On ne les relit pas dans la boucle : `getBoundingClientRect()` appelé à
   * chaque frame force un recalcul de mise en page, ce qui est précisément le
   * budget qu'on cherche à préserver sur les téléphones d'entrée de gamme visés.
   */
  const boxRef = useRef({ width: 0, height: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = canvas?.parentElement;
    if (!host) return;

    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) boxRef.current = { width: rect.width, height: rect.height };
    });
    observer.observe(host);
    const rect = host.getBoundingClientRect();
    boxRef.current = { width: rect.width, height: rect.height };

    return () => observer.disconnect();
  }, []);

  /**
   * Dernières valeurs *textuelles* écrites. Les transformations peuvent être
   * réécrites à chaque frame sans coût, mais réécrire un textContent identique
   * 60 fois par seconde invalide la mise en page pour rien.
   */
  const lastText = useRef<Record<string, string>>({});

  const setText = (el: HTMLElement | null, key: string, value: string) => {
    if (!el || lastText.current[key] === value) return;
    lastText.current[key] = value;
    el.textContent = value;
  };

  useImperativeHandle(ref, (): StageHandle => {
    return {
      render(p: number) {
        // Mise à l'échelle du repère logique dans la place que la mise en page
        // lui laisse. Calculée ici, en nombres, parce que CSS ne sait pas le
        // faire proprement (voir le commentaire sur le conteneur plus bas).
        if (canvasRef.current) {
          const { width, height } = boxRef.current;
          if (width > 0 && height > 0) {
            const near = Math.min(1.1, (width * 0.94) / NEAR_W, (height * 0.96) / NEAR_H);
            const far = Math.min(1, (width * 0.94) / STAGE_W, (height * 0.96) / STAGE_H);
            const pullBack = easeInOut(phaseProgress(p, "library"));
            canvasRef.current.style.transform = `scale(${lerp(near, far, pullBack)})`;
          }
        }

        const gather = phaseProgress(p, "gather");
        const declare = phaseProgress(p, "declare");
        const ripen = phaseProgress(p, "ripen");
        const alert = phaseProgress(p, "alert");
        const offline = phaseProgress(p, "offline");
        const library = phaseProgress(p, "library");

        // ---- Feuillets épars → pile résiduelle -------------------------------
        // Ils s'effacent pendant `ripen` : une fois l'attention portée sur
        // l'échéance, la pile derrière n'a plus rien à raconter.
        const stackFade = 1 - easeInOut(ripen);
        for (let i = 0; i < sheets.length; i += 1) {
          const el = sheetRefs.current[i];
          if (!el) continue;
          const s = sheets[i];
          const window = 1 - s.delay * 0.4;
          const local = easeInOut(clamp01((gather - s.delay * 0.4) / window));
          const x = lerp(s.x, s.restX, local);
          const y = lerp(s.y, s.restY, local);
          const rot = lerp(s.rot, s.restRot, local);
          el.style.transform = `translate3d(${x}px, ${y}px, 0) rotate(${rot}deg)`;
          el.style.opacity = String(lerp(0.55, 0.16, local) * stackFade);
        }
        if (stackRef.current) {
          stackRef.current.style.opacity = String(stackFade);
        }

        // ---- La fiche ---------------------------------------------------------
        // Elle n'apparaît que dans le dernier tiers de `gather` : les feuillets
        // doivent avoir convergé avant qu'elle ne se pose sur eux.
        const appear = easeOut(clamp01((gather - 0.55) / 0.45));
        const shrink = easeInOut(library);
        if (cardRef.current) {
          const scale = lerp(0.92, 1, appear) * (1 - 0.04 * easeInOut(alert)) * (1 - 0.66 * shrink);
          const y = lerp(26, 0, appear) - 34 * easeInOut(alert) - 40 * shrink;
          cardRef.current.style.transform = `translate3d(-50%, calc(-50% + ${y}px), 0) scale(${scale})`;
          cardRef.current.style.opacity = String(appear * (1 - easeOut(clamp01(library / 0.45))));
        }

        // ---- Les champs s'écrivent -------------------------------------------
        for (let i = 0; i < ROW_COUNT; i += 1) {
          const el = rowRefs.current[i];
          if (!el) continue;
          const local = easeOut(clamp01((declare - i * 0.15) / 0.36));
          el.style.opacity = String(local);
          el.style.transform = `translate3d(0, ${lerp(12, 0, local)}px, 0)`;
          const value = valueRefs.current[i];
          if (value) {
            // Effet « la valeur s'écrit » sans état par caractère : la valeur est
            // révélée par un masque qui s'ouvre. Un seul style à écrire par frame.
            value.style.clipPath = `inset(0 ${(1 - local) * 100}% 0 0)`;
          }
        }

        // ---- L'échéance mûrit -------------------------------------------------
        const ripenE = easeInOut(ripen);
        const days = Math.round(lerp(30, 0, ripenE));
        // L'anneau est une SURFACE, le compte à rebours est du TEXTE : la même
        // couleur ne convient pas aux deux. Mesuré : l'ambre du palier intermédiaire
        // tombe à 3,78:1 en texte, sous le seuil AA de 4,5:1 — c'est le seul palier
        // concerné, le corail et le rouge d'alarme passent tels quels. L'étape reste
        // lisible par l'anneau, qui lui garde bien l'ambre.
        const stage = ripenE < 0.45 ? "primary" : ripenE < 0.82 ? "warning" : "danger";
        const tone = `var(--color-${stage})`;
        const toneInk = stage === "warning" ? "var(--color-fg)" : tone;
        if (ringRef.current) {
          ringRef.current.style.strokeDashoffset = String(RING_C * (1 - ripenE));
          ringRef.current.style.stroke = tone;
        }
        if (countdownRef.current) {
          setText(
            countdownRef.current,
            "countdown",
            days <= 0 ? typo(card.deadline.today) : typo(card.deadline.countdown.replace("{n}", String(days))),
          );
          countdownRef.current.style.color = toneInk;
        }
        if (deadlineRef.current) {
          deadlineRef.current.style.borderColor = ripen > 0.05 ? tone : "var(--color-line)";
          deadlineRef.current.style.background =
            ripen > 0.05 ? `color-mix(in oklch, ${tone}, transparent ${92 - 6 * ripenE}%)` : "transparent";
        }

        // ---- L'alerte se détache ----------------------------------------------
        if (alertRef.current) {
          const e = easeOut(alert);
          const x = lerp(-30, 148, e);
          const y = lerp(96, -150, e);
          const scale = lerp(0.62, 1, easeOut(clamp01(alert / 0.45)));
          alertRef.current.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scale})`;
          alertRef.current.style.opacity = String(clamp01(alert / 0.22) * (1 - easeOut(clamp01(library / 0.4))));
        }

        // ---- Le réseau coupe, puis revient ------------------------------------
        // La file monte pendant la coupure, puis se vide au retour du réseau.
        // Jamais de faux « synchronisé » : l'état affiché suit exactement l'état simulé.
        let connState: "online" | "offline" | "syncing";
        let queue: number;
        if (offline <= 0.1) {
          connState = "online";
          queue = 0;
        } else if (offline <= 0.7) {
          connState = "offline";
          queue = Math.min(3, Math.floor(((offline - 0.1) / 0.6) * 3) + 1);
        } else if (offline <= 0.92) {
          connState = "syncing";
          queue = Math.max(0, 3 - Math.floor(((offline - 0.7) / 0.22) * 3));
        } else {
          connState = "online";
          queue = 0;
        }
        if (connRef.current) {
          connRef.current.style.opacity = String(clamp01(offline / 0.08) * (1 - easeOut(clamp01(library / 0.4))));
        }
        if (connDotRef.current) {
          connDotRef.current.style.background =
            connState === "offline"
              ? "var(--color-danger)"
              : connState === "syncing"
                ? "var(--color-warning)"
                : "var(--color-success)";
        }
        setText(
          connLabelRef.current,
          "conn",
          typo(
            connState === "offline"
              ? card.connection.offline
              : connState === "syncing"
                ? card.connection.syncing
                : card.connection.online,
          ),
        );
        setText(
          queueRef.current,
          "queue",
          typo(queue === 0 ? card.connection.queueEmpty : card.connection.queue.replace("{n}", String(queue))),
        );

        // ---- La fiche se démultiplie ------------------------------------------
        for (let i = 0; i < TILE_SLOTS.length; i += 1) {
          const el = tileRefs.current[i];
          if (!el) continue;
          const slot = TILE_SLOTS[i];
          const local = easeOut(clamp01((library - i * 0.06) / 0.56));
          const x = lerp(0, slot.x, local);
          const y = lerp(0, slot.y, local);
          const scale = lerp(0.32, 1, local);
          el.style.transform = `translate3d(calc(-50% + ${x}px), calc(-50% + ${y}px), 0) scale(${scale})`;
          el.style.opacity = String(local);
        }
      },
    };
  }, [sheets]);

  return (
    <div
      className="pointer-events-none absolute inset-0 flex items-center justify-center"
      // Un canevas est muet pour les technologies d'assistance : la mise en scène
      // est décrite une fois, et le détail utile est repris en texte dans les sections.
      role="img"
      aria-label={typo(content.hero.stageLabel)}
    >
      <div
        ref={canvasRef}
        className="relative"
        style={{
          width: STAGE_W,
          height: STAGE_H,
          // L'échelle est posée par `render()`, pas ici.
          //
          // Première version : `scale(min(1, 92vw / 880))`. C'est INVALIDE — en
          // CSS, `92vw / 880` reste une longueur, et `min()` refuse de mélanger
          // une longueur et le nombre 1. Le navigateur jette alors la propriété
          // `transform` ENTIÈRE, sans le moindre avertissement : la fiche n'était
          // ni mise à l'échelle ni positionnée, et débordait de l'écran dès que
          // la fenêtre devenait petite. Trouvé sur la planche de captures.
          transform: "scale(1)",
          transformOrigin: "center center",
        }}
      >
        {/* Feuillets épars — formes géométriques uniquement. Playbook §7 : on ne
            dessine ni main ni personnage, ça se lit toujours comme une tache. */}
        <div ref={stackRef} className="absolute inset-0">
          {sheets.map((s, i) => (
            <div
              key={i}
              ref={(el) => {
                sheetRefs.current[i] = el;
              }}
              className="absolute top-1/2 left-1/2 -mt-[116px] -ml-[84px] h-[232px] w-[168px] rounded-lg border border-veil/12 bg-veil/[0.04] p-4 backdrop-blur-[1px]"
              style={{ opacity: 0 }}
            >
              <div className="mb-3 h-1.5 w-2/3 rounded-full bg-veil/25" />
              {Array.from({ length: s.lines }, (_, k) => (
                <div key={k} className="mb-2 h-1 rounded-full bg-veil/12" style={{ width: `${58 + ((k * 37) % 40)}%` }} />
              ))}
            </div>
          ))}
        </div>

        {/* La fiche */}
        <div
          ref={cardRef}
          className="absolute top-1/2 left-1/2 rounded-[1.5rem] border border-line bg-surface/85 p-6 shadow-[0_32px_80px_-24px_rgba(0,0,0,0.55)] backdrop-blur-xl"
          style={{ width: CARD_W, opacity: 0 }}
        >
          <div className="mb-5 flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-medium tracking-[0.18em] text-primary uppercase">{typo(card.model)}</p>
              <p className="font-display mt-1 text-xl font-semibold">{typo(card.title)}</p>
            </div>
            <span className="rounded-full border border-success/40 bg-success/10 px-2.5 py-1 text-[11px] font-medium text-success">
              {typo(card.status)}
            </span>
          </div>

          <div className="space-y-2.5">
            {card.rows.map((row, i) => (
              <div
                key={row.label}
                ref={(el) => {
                  rowRefs.current[i] = el;
                }}
                className="flex items-baseline justify-between gap-4 border-b border-line/60 pb-2.5 text-sm"
                style={{ opacity: 0 }}
              >
                <span className="text-muted">{typo(row.label)}</span>
                <span
                  ref={(el) => {
                    valueRefs.current[i] = el;
                  }}
                  className="font-medium"
                  style={{ clipPath: "inset(0 100% 0 0)" }}
                >
                  {typo(row.value)}
                </span>
              </div>
            ))}

            {/* L'échéance : pas une ligne comme les autres. Elle porte l'anneau. */}
            <div
              ref={(el) => {
                rowRefs.current[card.rows.length] = el;
              }}
              style={{ opacity: 0 }}
            >
              <div
                ref={deadlineRef}
                className="mt-1 flex items-center gap-3 rounded-xl border border-line px-3 py-2.5 transition-none"
              >
                <svg width="38" height="38" viewBox="0 0 38 38" className="shrink-0 -rotate-90">
                  <circle cx="19" cy="19" r={RING_R} fill="none" stroke="var(--color-line)" strokeWidth="3" />
                  <circle
                    ref={ringRef}
                    cx="19"
                    cy="19"
                    r={RING_R}
                    fill="none"
                    stroke="var(--color-primary)"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeDasharray={RING_C}
                    strokeDashoffset={RING_C}
                  />
                </svg>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{typo(card.deadline.label)}</p>
                  <p className="text-xs text-muted">{typo(card.deadline.value)}</p>
                </div>
                <span ref={countdownRef} className="font-display text-sm font-semibold whitespace-nowrap">
                  {typo(card.deadline.countdown.replace("{n}", "30"))}
                </span>
              </div>
            </div>
          </div>

          {/* Indicateur de connexion — toujours présent, comme dans l'application. */}
          <div
            ref={connRef}
            className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-line/70 bg-veil/[0.03] px-3 py-2 text-xs"
            style={{ opacity: 0 }}
          >
            <span className="flex items-center gap-2">
              <span ref={connDotRef} className="size-2 rounded-full bg-success" />
              <span ref={connLabelRef} className="font-medium">
                {typo(card.connection.online)}
              </span>
            </span>
            <span ref={queueRef} className="text-muted">
              {typo(card.connection.queueEmpty)}
            </span>
          </div>
        </div>

        {/* L'alerte qui se détache de la fiche */}
        <div
          ref={alertRef}
          className="absolute top-1/2 left-1/2 -ml-[150px] w-[300px] rounded-2xl border border-danger/40 bg-surface/95 p-3.5 shadow-[0_24px_60px_-16px_rgba(0,0,0,0.6)] backdrop-blur-xl"
          style={{ opacity: 0 }}
        >
          <div className="flex items-start gap-3">
            <span className="relative mt-0.5 flex size-2.5 shrink-0">
              <span
                className="absolute inset-0 rounded-full bg-danger"
                style={{ animation: "pulse-ring 1.8s var(--ease-out-soft) infinite" }}
              />
              <span className="relative size-2.5 rounded-full bg-danger" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold">{typo(card.alert.title)}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted">{typo(card.alert.body)}</p>
            </div>
          </div>
        </div>

        {/* La bibliothèque : la fiche unique, démultipliée */}
        {content.templates.items.map((tpl, i) => (
          <div
            key={tpl.name}
            ref={(el) => {
              tileRefs.current[i] = el;
            }}
            className="absolute top-1/2 left-1/2 rounded-2xl border border-line bg-surface/85 p-4 backdrop-blur-xl"
            style={{ width: TILE_W, height: TILE_H, opacity: 0 }}
          >
            <p className="text-[10px] font-medium tracking-[0.16em] text-primary uppercase">
              {typo(content.templates.kinds[tpl.kind].label)}
            </p>
            <p className="font-display mt-1.5 text-base font-semibold">{typo(tpl.name)}</p>
            <div className="mt-3 space-y-1.5">
              <div className="h-1 w-full rounded-full bg-veil/12" />
              <div className="h-1 w-4/5 rounded-full bg-veil/10" />
              <div className="h-1 w-3/5 rounded-full bg-veil/[0.08]" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
