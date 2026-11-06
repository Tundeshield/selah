import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import clsx from "clsx";
import { ArrowLeft, Download, FlipHorizontal2, RotateCcw, Save } from "lucide-react";
import { useChurch } from "../context/ChurchContext";
import { db } from "../lib/firebase";
import { useDocData, useStorageImage, useUnsavedWarning } from "../lib/hooks";
import { loadImage, GRAPHIC_SIZES } from "../lib/graphic";
import { DEFAULT_EDIT, DEFAULT_TEXT, PhotoEdit, PhotoText, normalizeEdit, renderPhoto, renderText } from "../lib/photo";
import { useFlags } from "../lib/flags";
import { errMessage } from "../lib/format";
import type { MediaItem } from "../lib/types";
import { Button, EmptyState, Input, PageLoading, Tabs, Textarea, useToast } from "../components/ui";
import { AdjustSliders, Chips, FilterGrid, OverlayControls, Slider, usePanZoom } from "../components/PhotoControls";

type Panel = "crop" | "filters" | "adjust" | "overlay" | "text";
type SizeId = keyof typeof GRAPHIC_SIZES | "original";

function outputDims(size: SizeId, m: MediaItem) {
  if (size === "original") {
    const r = 2048 / Math.max(m.width, m.height);
    return { w: Math.round(m.width * Math.min(1, r)), h: Math.round(m.height * Math.min(1, r)) };
  }
  return GRAPHIC_SIZES[size];
}

export default function PhotoEditorPage() {
  const { mediaId = "" } = useParams();
  const { churchId, church, can } = useChurch();
  const flags = useFlags();
  const toast = useToast();
  const mq = useDocData<MediaItem>(`churches/${churchId}/media/${mediaId}`);
  const m = mq.data;
  const img = useStorageImage(m?.path);
  const thumb = useStorageImage(m?.thumbPath);

  const [edit, setEdit] = useState<PhotoEdit>(DEFAULT_EDIT);
  const [text, setText] = useState<PhotoText>(DEFAULT_TEXT);
  const [size, setSize] = useState<SizeId>("square");
  const [panel, setPanel] = useState<Panel>("crop");
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [saved, setSaved] = useState("");
  const [saving, setSaving] = useState(false);
  const [logo, setLogo] = useState<HTMLImageElement | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (church?.logoUrl) loadImage(church.logoUrl).then(setLogo);
  }, [church?.logoUrl]);

  // Load stored edit once per photo.
  useEffect(() => {
    if (!m || loadedFor === m.id) return;
    const e = normalizeEdit(m.edit);
    const t = { ...DEFAULT_TEXT, ...(m.text || {}) };
    const s = (m.outputSize as SizeId) || "square";
    setEdit(e);
    setText(t);
    setSize(s);
    setSaved(JSON.stringify([e, t, s]));
    setLoadedFor(m.id);
  }, [m, loadedFor]);

  const state = JSON.stringify([edit, text, size]);
  const dirty = !!saved && state !== saved;
  useUnsavedWarning(dirty);
  const set = (p: Partial<PhotoEdit>) => setEdit((e) => ({ ...e, ...p }));
  const setT = (p: Partial<PhotoText>) => setText((t) => ({ ...t, ...p }));
  const pz = usePanZoom(edit, set);
  const dims = m ? outputDims(size, m) : { w: 1080, h: 1080 };

  // Draw the preview at reduced resolution; export renders at full size.
  const frame = useRef(0);
  useEffect(() => {
    const c = canvas.current;
    if (!c || !img || !m) return;
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const k = Math.min(1, 900 / Math.max(dims.w, dims.h));
      c.width = Math.round(dims.w * k);
      c.height = Math.round(dims.h * k);
      draw(c, k);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [img, state, logo]);

  function draw(c: HTMLCanvasElement, k: number) {
    const ctx = c.getContext("2d", { willReadFrequently: true })!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    renderPhoto(ctx, img!, c.width, c.height, edit, church?.brand?.accent);
    if (text.headline.trim() || text.sub.trim() || text.logo) renderText(ctx, c.width, c.height, text, { logo, churchName: church?.name });
    void k;
  }

  const save = async () => {
    setSaving(true);
    try {
      await updateDoc(doc(db, "churches", churchId, "media", mediaId), { edit, text, outputSize: size, updatedAt: serverTimestamp() });
      setSaved(state);
      toast("Edits saved", "success");
    } catch (e) {
      toast(errMessage(e), "error");
    } finally {
      setSaving(false);
    }
  };

  const download = async () => {
    if (!img || !m) return;
    await document.fonts.ready;
    const c = document.createElement("canvas");
    c.width = dims.w;
    c.height = dims.h;
    draw(c, 1);
    c.toBlob(
      (b) => {
        if (!b) return toast("Couldn't export this image", "error");
        const a = document.createElement("a");
        a.href = URL.createObjectURL(b);
        a.download = `${m.name.replace(/[^\w-]+/g, "-").toLowerCase() || "photo"}-${size}.jpg`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      },
      "image/jpeg",
      0.92,
    );
  };

  const sizeOptions = useMemo(() => [...Object.entries(GRAPHIC_SIZES).map(([id, s]) => ({ id: id as SizeId, label: s.label })), { id: "original" as SizeId, label: "Original" }], []);

  if (!flags.photoEditor) return <EmptyState title="Photo editor is turned off">This feature isn't enabled for your workspace yet.</EmptyState>;
  if (mq.loading) return <PageLoading />;
  if (!m) return <EmptyState title="Photo not found" action={<Link to="/media" className="text-sm font-medium underline">Back to Media</Link>}>It may have been deleted.</EmptyState>;
  const readOnly = !can("contributor");

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Link to="/media" className="rounded-lg p-2 text-fg-muted hover:bg-gray-100 hover:text-fg" aria-label="Back to Media"><ArrowLeft className="h-5 w-5" /></Link>
          <div className="min-w-0">
            <div className="eyebrow">Photo editor</div>
            <h1 className="truncate text-xl font-semibold text-fg">{m.name}</h1>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" icon={<RotateCcw className="h-4 w-4" />} onClick={() => { setEdit(DEFAULT_EDIT); setText(DEFAULT_TEXT); }}>Reset</Button>
          {!readOnly && <Button variant="secondary" size="sm" icon={<Save className="h-4 w-4" />} loading={saving} disabled={!dirty} onClick={save}>{dirty ? "Save edits" : "Saved"}</Button>}
          <Button size="sm" icon={<Download className="h-4 w-4" />} disabled={!img} onClick={download}>Download {dims.w}×{dims.h}</Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-h-[20rem] items-center justify-center rounded-2xl bg-[#1a1d1f] p-4 sm:p-8">
          {img ? (
            <canvas
              ref={canvas}
              {...(panel === "crop" ? { onPointerDown: pz.onPointerDown, onPointerMove: pz.onPointerMove, onPointerUp: pz.onPointerUp, onPointerCancel: pz.onPointerUp } : {})}
              className={clsx("max-h-[70vh] max-w-full touch-none rounded-md shadow-2xl", panel === "crop" && "cursor-grab active:cursor-grabbing")}
              style={{ aspectRatio: `${dims.w} / ${dims.h}` }}
              role="img"
              aria-label={`Preview of ${m.name}`}
            />
          ) : (
            <PageLoading />
          )}
        </div>

        <div className="card p-5">
          <Tabs<Panel>
            value={panel}
            onChange={setPanel}
            className="mb-5"
            tabs={[
              { id: "crop", label: "Crop" },
              { id: "filters", label: "Filters" },
              { id: "adjust", label: "Adjust" },
              { id: "overlay", label: "Overlay" },
              { id: "text", label: "Text" },
            ]}
          />
          {panel === "crop" && (
            <div className="space-y-5">
              <div>
                <div className="label">Size</div>
                <Chips value={size} options={sizeOptions} onChange={setSize} />
              </div>
              <Slider label="Zoom" value={edit.zoom} min={1} max={3} step={0.01} neutral={1} onChange={(v) => set({ zoom: v })} format={(v) => `${Math.round(v * 100)}%`} />
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-fg-muted">Drag the photo to reposition it.</p>
                <Button variant="secondary" size="sm" icon={<FlipHorizontal2 className="h-4 w-4" />} onClick={() => set({ flip: !edit.flip })}>Flip</Button>
              </div>
              <Button variant="ghost" size="sm" onClick={() => set({ zoom: 1, panX: 0, panY: 0, flip: false })}>Reset crop</Button>
            </div>
          )}
          {panel === "filters" && <FilterGrid img={thumb || img} edit={edit} onPick={(id) => set({ filter: id })} />}
          {panel === "adjust" && <AdjustSliders edit={edit} set={set} />}
          {panel === "overlay" && <OverlayControls edit={edit} set={set} />}
          {panel === "text" && (
            <div className="space-y-4">
              <Textarea label="Headline" rows={2} value={text.headline} onChange={(e) => setT({ headline: e.target.value })} placeholder="Sunday Service · 9AM" />
              <Input label="Supporting line" value={text.sub} onChange={(e) => setT({ sub: e.target.value })} placeholder="Join us this weekend" />
              <div>
                <div className="label">Position</div>
                <Chips value={text.position} options={[{ id: "top", label: "Top" }, { id: "center", label: "Middle" }, { id: "bottom", label: "Bottom" }]} onChange={(v) => setT({ position: v })} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="label">Align</div>
                  <Chips value={text.align} options={[{ id: "left", label: "Left" }, { id: "center", label: "Centre" }]} onChange={(v) => setT({ align: v })} />
                </div>
                <div>
                  <div className="label">Size</div>
                  <Chips value={text.size} options={[{ id: "s", label: "S" }, { id: "m", label: "M" }, { id: "l", label: "L" }]} onChange={(v) => setT({ size: v })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="label">Colour</div>
                  <Chips value={text.color} options={[{ id: "white", label: "White" }, { id: "ink", label: "Dark" }]} onChange={(v) => setT({ color: v })} />
                </div>
                <div>
                  <div className="label">Logo</div>
                  <Chips value={text.logo ? "on" : "off"} options={[{ id: "on", label: "Show" }, { id: "off", label: "Hide" }]} onChange={(v) => setT({ logo: v === "on" })} />
                </div>
              </div>
              {(text.headline || text.sub) && edit.overlay === "none" && (
                <button type="button" className="text-xs font-medium text-brand-700 underline underline-offset-2" onClick={() => set({ overlay: "dark", overlayStyle: text.position === "top" ? "top" : text.position === "center" ? "full" : "bottom", overlayAmount: 55 })}>
                  Text hard to read? Add a fade behind it
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
