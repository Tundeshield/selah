import { useEffect, useRef } from "react";
import clsx from "clsx";
import { FILTERS, PhotoEdit, renderPhoto } from "../lib/photo";

export function Slider({ label, value, min = -100, max = 100, step = 1, onChange, format, neutral = 0 }: { label: string; value: number; min?: number; max?: number; step?: number; onChange: (v: number) => void; format?: (v: number) => string; neutral?: number }) {
  return (
    <label className="block" onDoubleClick={() => onChange(neutral)} title="Double-click to reset">
      <span className="mb-1 flex items-center justify-between text-[0.8125rem]">
        <span className="font-medium text-fg">{label}</span>
        <span className={clsx("tabular-nums", value === neutral ? "text-fg-muted" : "font-semibold text-brand-700")}>{format ? format(value) : value > 0 && min < 0 ? `+${value}` : value}</span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="selah-range w-full" />
    </label>
  );
}

export function Chips<T extends string>({ value, options, onChange }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button key={o.id} type="button" onClick={() => onChange(o.id)} aria-pressed={value === o.id} className={clsx("rounded-full px-3 py-1.5 text-[0.8125rem] font-medium ring-1 transition", value === o.id ? "bg-ink text-white ring-ink" : "bg-white text-fg ring-gray-200 hover:ring-gray-400")}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Filter presets rendered on the actual photo. */
export function FilterGrid({ img, edit, onPick, cols = 3 }: { img: HTMLImageElement | null; edit: PhotoEdit; onPick: (id: string) => void; cols?: number }) {
  return (
    <div className={clsx("grid gap-2", cols === 5 ? "grid-cols-5" : "grid-cols-3")}>
      {FILTERS.map((f) => (
        <button key={f.id} type="button" onClick={() => onPick(f.id)} className="group text-center" aria-pressed={edit.filter === f.id}>
          <FilterThumb img={img} edit={{ ...edit, filter: f.id, blur: 0, overlay: "none", grain: 0, zoom: 1, panX: 0, panY: 0 }} selected={edit.filter === f.id} />
          <span className={clsx("mt-1 block text-[0.6875rem]", edit.filter === f.id ? "font-semibold text-fg" : "text-fg-muted")}>{f.label}</span>
        </button>
      ))}
    </div>
  );
}

function FilterThumb({ img, edit, selected }: { img: HTMLImageElement | null; edit: PhotoEdit; selected: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const key = JSON.stringify([edit.filter, edit.brightness, edit.contrast, edit.saturation, edit.warmth, edit.fade, edit.vignette]);
  useEffect(() => {
    const c = ref.current;
    if (!c || !img) return;
    c.width = 120;
    c.height = 120;
    renderPhoto(c.getContext("2d", { willReadFrequently: true })!, img, 120, 120, edit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [img, key]);
  return <canvas ref={ref} className={clsx("aspect-square w-full rounded-lg bg-gray-200", selected ? "outline outline-2 outline-offset-2 outline-brand-500" : "ring-1 ring-black/5 group-hover:ring-black/25")} />;
}

export const OVERLAY_OPTIONS = [
  { id: "none" as const, label: "None" },
  { id: "dark" as const, label: "Dark" },
  { id: "brand" as const, label: "Brand" },
  { id: "light" as const, label: "Light" },
];
export const OVERLAY_STYLES = [
  { id: "full" as const, label: "Even" },
  { id: "bottom" as const, label: "Fade from bottom" },
  { id: "top" as const, label: "Fade from top" },
];

export function AdjustSliders({ edit, set }: { edit: PhotoEdit; set: (p: Partial<PhotoEdit>) => void }) {
  return (
    <div className="space-y-4">
      <Slider label="Brightness" value={edit.brightness} onChange={(v) => set({ brightness: v })} />
      <Slider label="Contrast" value={edit.contrast} onChange={(v) => set({ contrast: v })} />
      <Slider label="Saturation" value={edit.saturation} onChange={(v) => set({ saturation: v })} />
      <Slider label="Warmth" value={edit.warmth} onChange={(v) => set({ warmth: v })} />
      <Slider label="Fade" value={edit.fade} min={0} onChange={(v) => set({ fade: v })} />
      <Slider label="Blur" value={edit.blur} min={0} onChange={(v) => set({ blur: v })} />
      <Slider label="Vignette" value={edit.vignette} min={0} onChange={(v) => set({ vignette: v })} />
      <Slider label="Grain" value={edit.grain} min={0} onChange={(v) => set({ grain: v })} />
    </div>
  );
}

export function OverlayControls({ edit, set }: { edit: PhotoEdit; set: (p: Partial<PhotoEdit>) => void }) {
  return (
    <div className="space-y-4">
      <div>
        <div className="label">Colour</div>
        <Chips value={edit.overlay} options={OVERLAY_OPTIONS} onChange={(v) => set({ overlay: v })} />
      </div>
      {edit.overlay !== "none" && (
        <>
          <div>
            <div className="label">Style</div>
            <Chips value={edit.overlayStyle} options={OVERLAY_STYLES} onChange={(v) => set({ overlayStyle: v })} />
          </div>
          <Slider label="Strength" value={edit.overlayAmount} min={0} max={90} onChange={(v) => set({ overlayAmount: v })} format={(v) => `${v}%`} neutral={40} />
        </>
      )}
      <p className="text-xs text-fg-muted">An overlay keeps text readable on busy photos.</p>
    </div>
  );
}

/** Drag on the preview to reposition, scroll / pinch to zoom. */
export function usePanZoom(edit: PhotoEdit, set: (p: Partial<PhotoEdit>) => void) {
  const drag = useRef<{ x: number; y: number; px: number; py: number; w: number; h: number } | null>(null);
  return {
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
      const r = e.currentTarget.getBoundingClientRect();
      drag.current = { x: e.clientX, y: e.clientY, px: edit.panX, py: edit.panY, w: r.width, h: r.height };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    onPointerMove: (e: React.PointerEvent<HTMLElement>) => {
      const d = drag.current;
      if (!d) return;
      const k = 2 / Math.max(0.25, edit.zoom - 0.6);
      const clamp = (v: number) => Math.max(-1, Math.min(1, v));
      set({ panX: clamp(d.px + ((e.clientX - d.x) / d.w) * k), panY: clamp(d.py + ((e.clientY - d.y) / d.h) * k) });
    },
    onPointerUp: () => {
      drag.current = null;
    },
    onWheel: (e: React.WheelEvent<HTMLElement>) => {
      set({ zoom: Math.max(1, Math.min(3, +(edit.zoom - e.deltaY * 0.0015).toFixed(3))) });
    },
  };
}
