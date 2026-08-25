"use client";

/**
 * Visionneuse plein écran pour un document/photo déjà résolu (URL signée,
 * nom, type MIME) — remplace le simple `<a target="_blank">` qui ouvrait le
 * fichier brut dans un nouvel onglet. Deux modes :
 * - **Image** : zoom (molette, boutons, double-clic), déplacement (glisser
 *   une fois zoomée), rotation par quart de tour — tout en manipulations
 *   CSS `transform`, aucune bibliothèque.
 * - **PDF** : intégré dans un `<iframe>` — le visualiseur natif du
 *   navigateur porte déjà son propre zoom/déplacement/pagination ; le
 *   dupliquer avec une bibliothèque de rendu (pdf.js) aurait ajouté une
 *   dépendance lourde pour un résultat pas meilleur que ce qui existe déjà
 *   nativement. Seuls la fermeture et le téléchargement sont communs aux deux.
 *
 * `Dialog` de `radix-ui` (déjà utilisé par `alert-dialog.tsx`) plutôt qu'un
 * `<dialog>` natif fait à la main : focus piégé, Échap, fond inerte viennent
 * de la même primitive dans tout le projet, pas deux implémentations.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import {
  Download,
  Loader2,
  RotateCcw,
  RotateCw,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface MediaViewerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  url: string;
  filename: string;
  contentType: string;
}

const MIN_SCALE = 0.5;
const MAX_SCALE = 6;
const ZOOM_STEP = 0.35;

export function MediaViewer({ open, onOpenChange, url, filename, contentType }: MediaViewerProps) {
  const isImage = contentType.startsWith("image/");
  const isPdf = contentType === "application/pdf";

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/92 duration-150 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <DialogPrimitive.Content
          className="fixed inset-0 z-50 flex flex-col outline-none duration-150 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0"
          aria-describedby={undefined}
        >
          <DialogPrimitive.Title className="sr-only">{filename}</DialogPrimitive.Title>
          <header className="flex items-center justify-between gap-3 px-4 py-3 text-white/90 sm:px-6">
            <span className="min-w-0 truncate text-sm font-medium">{filename}</span>
            <div className="flex shrink-0 items-center gap-1.5">
              <Button variant="ghost" size="icon" className="text-white/80 hover:bg-white/10 hover:text-white" asChild>
                <a href={url} download={filename} aria-label="Télécharger">
                  <Download className="size-4" />
                </a>
              </Button>
              <DialogPrimitive.Close asChild>
                <Button variant="ghost" size="icon" className="text-white/80 hover:bg-white/10 hover:text-white" aria-label="Fermer">
                  <X className="size-4" />
                </Button>
              </DialogPrimitive.Close>
            </div>
          </header>

          <div className="relative flex-1 overflow-hidden">
            {isImage ? <ImageStage url={url} alt={filename} /> : null}
            {isPdf ? <iframe src={url} title={filename} className="size-full border-0 bg-white" /> : null}
            {!isImage && !isPdf ? (
              <div className="flex size-full flex-col items-center justify-center gap-3 text-white/70">
                <p className="text-sm">Aperçu non disponible pour ce type de fichier.</p>
                <Button variant="outline" className="border-white/20 bg-transparent text-white hover:bg-white/10" asChild>
                  <a href={url} download={filename}>
                    <Download className="size-4" />
                    Télécharger « {filename} »
                  </a>
                </Button>
              </div>
            ) : null}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function ImageStage({ url, alt }: { url: string; alt: string }) {
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [loaded, setLoaded] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const clampScale = useCallback((value: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, value)), []);

  function resetView() {
    setScale(1);
    setRotation((r) => r); // la rotation reste volontairement — "réinitialiser" porte sur le zoom/déplacement
    setPosition({ x: 0, y: 0 });
  }

  function zoomBy(delta: number) {
    setScale((prev) => {
      const next = clampScale(prev + delta);
      if (next === 1) setPosition({ x: 0, y: 0 });
      return next;
    });
  }

  function onWheel(e: React.WheelEvent) {
    e.preventDefault();
    zoomBy(e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP);
  }

  function onDoubleClick() {
    setScale((prev) => {
      if (prev > 1) {
        setPosition({ x: 0, y: 0 });
        return 1;
      }
      return 2.2;
    });
  }

  function onPointerDown(e: React.PointerEvent) {
    if (scale <= 1) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, originX: position.x, originY: position.y };
    setIsDragging(true);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!dragRef.current) return;
    const { startX, startY, originX, originY } = dragRef.current;
    setPosition({ x: originX + (e.clientX - startX), y: originY + (e.clientY - startY) });
  }

  function onPointerUp() {
    dragRef.current = null;
    setIsDragging(false);
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "+" || e.key === "=") zoomBy(ZOOM_STEP);
      if (e.key === "-") zoomBy(-ZOOM_STEP);
      if (e.key === "0") resetView();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- zoomBy/resetView recréées chaque rendu, l'écouteur n'a besoin que d'être posé une fois
  }, []);

  return (
    <div className="flex size-full flex-col">
      <div
        ref={containerRef}
        className={cn("relative flex-1 touch-none overflow-hidden", scale > 1 ? "cursor-grab active:cursor-grabbing" : "cursor-zoom-in")}
        onWheel={onWheel}
        onDoubleClick={onDoubleClick}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        {!loaded ? (
          <div className="absolute inset-0 flex items-center justify-center text-white/60">
            <Loader2 className="size-6 animate-spin" />
          </div>
        ) : null}
        {/* eslint-disable-next-line @next/next/no-img-element -- URL signée à courte durée de vie, transformée librement (zoom/rotation), pas un cas pour next/image */}
        <img
          src={url}
          alt={alt}
          onLoad={() => setLoaded(true)}
          draggable={false}
          className={cn("absolute top-1/2 left-1/2 max-h-none max-w-none select-none", !loaded && "opacity-0")}
          style={{
            transform: `translate(-50%, -50%) translate(${position.x}px, ${position.y}px) scale(${scale}) rotate(${rotation}deg)`,
            transition: isDragging ? "none" : "transform 0.15s ease-out",
            maxHeight: rotation % 180 === 0 ? "90vh" : "90vw",
            maxWidth: rotation % 180 === 0 ? "90vw" : "90vh",
          }}
        />
      </div>

      <div className="flex items-center justify-center gap-1 px-4 py-3">
        <div className="flex items-center gap-1 rounded-full bg-white/10 p-1 backdrop-blur">
          <Button variant="ghost" size="icon-sm" className="text-white/85 hover:bg-white/15 hover:text-white" onClick={() => zoomBy(-ZOOM_STEP)} aria-label="Réduire">
            <ZoomOut className="size-4" />
          </Button>
          <button
            type="button"
            onClick={resetView}
            className="min-w-12 px-1 text-center text-xs font-medium text-white/85 tabular-nums hover:text-white"
          >
            {Math.round(scale * 100)}%
          </button>
          <Button variant="ghost" size="icon-sm" className="text-white/85 hover:bg-white/15 hover:text-white" onClick={() => zoomBy(ZOOM_STEP)} aria-label="Agrandir">
            <ZoomIn className="size-4" />
          </Button>
          <span className="mx-1 h-4 w-px bg-white/20" aria-hidden />
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-white/85 hover:bg-white/15 hover:text-white"
            onClick={() => setRotation((r) => (r - 90 + 360) % 360)}
            aria-label="Pivoter à gauche"
          >
            <RotateCcw className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-white/85 hover:bg-white/15 hover:text-white"
            onClick={() => setRotation((r) => (r + 90) % 360)}
            aria-label="Pivoter à droite"
          >
            <RotateCw className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
