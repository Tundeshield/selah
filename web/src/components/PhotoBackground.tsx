import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import clsx from "clsx";
import { Check, ImagePlus, Loader2 } from "lucide-react";
import { useChurch } from "../context/ChurchContext";
import { useStorageImage } from "../lib/hooks";
import { PHOTO_BG_EDIT } from "../lib/graphic";
import type { PhotoEdit } from "../lib/photo";
import type { MediaItem } from "../lib/types";
import { useMediaLibrary, useUploadPhotos } from "../pages/Media";
import { Modal } from "./ui";
import { StorageImage } from "./bits";
import { Chips, FilterGrid, Slider } from "./PhotoControls";

type PhotoBg = { path: string; mediaId?: string; edit: PhotoEdit };

function fromMedia(m: MediaItem): PhotoBg {
  // Start from the photo's saved edit (if any) but always keep text readable.
  const e = { ...PHOTO_BG_EDIT, ...(m.edit || {}) };
  if (e.overlay === "none" || e.overlayAmount < 30) Object.assign(e, { overlay: "dark", overlayStyle: "full", overlayAmount: 50 });
  return { path: m.path, mediaId: m.id, edit: e };
}

export function PhotoBackgroundPicker({ active, value, onChange }: { active: boolean; value: PhotoBg | null; onChange: (v: PhotoBg | null) => void }) {
  const { can } = useChurch();
  const lib = useMediaLibrary();
  const { upload, busy } = useUploadPhotos();
  const input = useRef<HTMLInputElement>(null);
  const [all, setAll] = useState(false);
  const thumb = useStorageImage(active && value ? value.path.replace(/photo\.jpg$/, "thumb.jpg") : null);
  const edit = { ...PHOTO_BG_EDIT, ...(value?.edit || {}) };
  const set = (p: Partial<PhotoEdit>) => value && onChange({ ...value, edit: { ...edit, ...p } });
  const pick = (m: MediaItem) => {
    onChange(fromMedia(m));
    setAll(false);
  };
  const shown = lib.data.slice(0, 6);
  const [pending, setPending] = useState<string | null>(null);
  useEffect(() => {
    // Select a just-uploaded photo once it appears in the library.
    const m = pending && lib.data.find((x) => x.id === pending);
    if (m) {
      setPending(null);
      pick(m);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, lib.data]);

  return (
    <div>
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
        {can("contributor") && (
          <button type="button" onClick={() => input.current?.click()} disabled={!!busy} className="flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-gray-300 bg-white text-[0.6875rem] text-fg-muted hover:border-gray-500 hover:text-fg">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
            Upload
          </button>
        )}
        {shown.map((m) => (
          <PhotoTile key={m.id} m={m} selected={active && value?.mediaId === m.id} onClick={() => pick(m)} />
        ))}
        {lib.data.length > shown.length && (
          <button type="button" onClick={() => setAll(true)} className="flex aspect-square items-center justify-center rounded-lg bg-gray-100 text-[0.75rem] font-medium text-fg hover:bg-gray-200">
            +{lib.data.length - shown.length}
          </button>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={async (e) => {
          const files = e.target.files;
          e.target.value = "";
          if (!files?.length) return;
          const ids = await upload(files);
          if (ids[0]) setPending(ids[0]);
        }}
      />
      {!lib.loading && lib.data.length === 0 && <p className="mt-2 text-xs text-fg-muted">Upload a photo from a service or your building to use it behind this quote.</p>}

      {active && value && (
        <div className="mt-4 space-y-4 rounded-xl bg-gray-50 p-4 ring-1 ring-gray-200">
          <div>
            <div className="label">Look</div>
            <FilterGrid img={thumb} edit={edit} onPick={(id) => set({ filter: id })} cols={5} />
          </div>
          <div>
            <div className="label">Overlay</div>
            <Chips value={edit.overlay === "none" ? "dark" : edit.overlay} options={[{ id: "dark", label: "Dark" }, { id: "brand", label: "Brand" }]} onChange={(v) => set({ overlay: v })} />
          </div>
          <Slider label="Darken" value={edit.overlayAmount} min={0} max={90} neutral={50} onChange={(v) => set({ overlayAmount: v, overlay: edit.overlay === "none" ? "dark" : edit.overlay })} format={(v) => `${v}%`} />
          <Slider label="Blur" value={edit.blur} min={0} onChange={(v) => set({ blur: v })} />
          <Slider label="Zoom" value={edit.zoom} min={1} max={3} step={0.01} neutral={1} onChange={(v) => set({ zoom: v })} format={(v) => `${Math.round(v * 100)}%`} />
          <div className="grid grid-cols-2 gap-4">
            <Slider label="Left / right" value={Math.round(edit.panX * 100)} onChange={(v) => set({ panX: v / 100 })} format={(v) => `${v}`} />
            <Slider label="Up / down" value={Math.round(edit.panY * 100)} onChange={(v) => set({ panY: v / 100 })} format={(v) => `${v}`} />
          </div>
          <div className="flex items-center justify-between text-xs">
            <button type="button" className="font-medium text-fg-muted hover:text-fg" onClick={() => onChange(null)}>Remove photo</button>
            {value.mediaId && <Link to={`/media/${value.mediaId}`} className="font-medium text-brand-700 underline underline-offset-2">Open in photo editor</Link>}
          </div>
        </div>
      )}

      <Modal open={all} onClose={() => setAll(false)} title="Choose a photo" wide>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {lib.data.map((m) => (
            <PhotoTile key={m.id} m={m} selected={active && value?.mediaId === m.id} onClick={() => pick(m)} />
          ))}
        </div>
      </Modal>
    </div>
  );
}

function PhotoTile({ m, selected, onClick }: { m: MediaItem; selected: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={selected} aria-label={m.name} className={clsx("relative aspect-square overflow-hidden rounded-lg bg-gray-100", selected ? "outline outline-2 outline-offset-2 outline-brand-500" : "ring-1 ring-black/5 hover:ring-black/25")}>
      <StorageImage path={m.thumbPath} alt="" className="h-full w-full object-cover" />
      {selected && <span className="absolute right-1 top-1 rounded-full bg-brand-500 p-0.5 text-white"><Check className="h-3 w-3" /></span>}
    </button>
  );
}
