import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { collection, deleteDoc, doc, orderBy, query, serverTimestamp, setDoc } from "firebase/firestore";
import { deleteObject, ref, uploadBytes } from "firebase/storage";
import { ImagePlus, Loader2, Trash2, Wand2 } from "lucide-react";
import { useChurch } from "../context/ChurchContext";
import { useAuth } from "../context/AuthContext";
import { db, storage } from "../lib/firebase";
import { useQueryData } from "../lib/hooks";
import { prepareUpload } from "../lib/photo";
import { useFlags } from "../lib/flags";
import { errMessage } from "../lib/format";
import type { MediaItem } from "../lib/types";
import { Button, EmptyState, PageHeader, PageLoading, useToast } from "../components/ui";
import { StorageImage } from "../components/bits";

export function useMediaLibrary() {
  const { churchId } = useChurch();
  return useQueryData<MediaItem>(query(collection(db, "churches", churchId, "media"), orderBy("createdAt", "desc")), `media-${churchId}`);
}

export function useUploadPhotos() {
  const { churchId } = useChurch();
  const { user } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState(0);
  const upload = async (files: FileList | File[]) => {
    const list = Array.from(files).filter((f) => f.type.startsWith("image/") || /\.(jpe?g|png|webp|heic)$/i.test(f.name));
    if (!list.length) return [];
    setBusy((b) => b + list.length);
    const ids: string[] = [];
    for (const file of list) {
      try {
        const p = await prepareUpload(file);
        const id = doc(collection(db, "churches", churchId, "media")).id;
        const base = `churches/${churchId}/media/${id}`;
        await uploadBytes(ref(storage, `${base}/photo.jpg`), p.full, { contentType: "image/jpeg" });
        await uploadBytes(ref(storage, `${base}/thumb.jpg`), p.thumb, { contentType: "image/jpeg" });
        await setDoc(doc(db, "churches", churchId, "media", id), {
          name: file.name.replace(/\.[^.]+$/, "").slice(0, 120) || "Photo",
          path: `${base}/photo.jpg`,
          thumbPath: `${base}/thumb.jpg`,
          width: p.width,
          height: p.height,
          size: p.full.size,
          createdBy: user!.uid,
          createdAt: serverTimestamp(),
        });
        ids.push(id);
      } catch (e) {
        toast(`${file.name}: ${errMessage(e)}`, "error");
      } finally {
        setBusy((b) => b - 1);
      }
    }
    return ids;
  };
  return { upload, busy };
}

export default function Media() {
  const { churchId, can } = useChurch();
  const flags = useFlags();
  const navigate = useNavigate();
  const toast = useToast();
  const lib = useMediaLibrary();
  const { upload, busy } = useUploadPhotos();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  if (!flags.photoEditor) return <EmptyState title="Photo editor is turned off">This feature isn't enabled for your workspace yet.</EmptyState>;
  if (lib.loading) return <PageLoading />;

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const ids = await upload(files);
    if (ids.length === 1) navigate(`/media/${ids[0]}`);
    else if (ids.length) toast(`${ids.length} photos added`, "success");
  };

  const remove = async (m: MediaItem) => {
    if (!confirm(`Delete “${m.name}”? Graphics already using it will fall back to a dark background.`)) return;
    try {
      await deleteDoc(doc(db, "churches", churchId, "media", m.id));
      await Promise.all([deleteObject(ref(storage, m.path)).catch(() => undefined), deleteObject(ref(storage, m.thumbPath)).catch(() => undefined)]);
    } catch (e) {
      toast(errMessage(e), "error");
    }
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (can("contributor")) onFiles(e.dataTransfer.files);
      }}
    >
      <PageHeader
        eyebrow="Beta"
        title="Media"
        subtitle="Your church's photos. Edit them into ready-to-post images, or use them behind quote graphics."
        actions={can("contributor") && <Button icon={busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />} disabled={!!busy} onClick={() => input.current?.click()}>{busy ? `Uploading ${busy}…` : "Upload photos"}</Button>}
      />
      <input ref={input} type="file" accept="image/*" multiple className="hidden" onChange={(e) => onFiles(e.target.files).finally(() => (e.target.value = ""))} />

      {lib.data.length === 0 ? (
        <button type="button" disabled={!can("contributor")} onClick={() => input.current?.click()} className={`flex w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-20 text-center transition ${over ? "border-brand-500 bg-brand-50" : "border-gray-300 bg-white hover:border-gray-400"}`}>
          <ImagePlus className="mb-3 h-8 w-8 text-fg-muted" />
          <span className="text-base font-semibold text-fg">Drop photos here</span>
          <span className="mt-1 max-w-sm text-sm text-fg-muted">Services, worship moments, your building, events. Photos are resized before upload, so even large ones go up quickly.</span>
        </button>
      ) : (
        <div className={`grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 ${over ? "rounded-2xl ring-2 ring-brand-500 ring-offset-4" : ""}`}>
          {lib.data.map((m) => (
            <div key={m.id} className="group relative overflow-hidden rounded-xl bg-gray-100 ring-1 ring-gray-200">
              <Link to={`/media/${m.id}`} className="block aspect-[4/3]">
                <StorageImage path={m.thumbPath} alt={m.name} className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]" />
              </Link>
              <div className="flex items-center justify-between gap-2 bg-white px-3 py-2">
                <span className="truncate text-[0.8125rem] font-medium text-fg">{m.name}</span>
                <span className="flex shrink-0 items-center gap-1">
                  {m.edit && <Wand2 className="h-3.5 w-3.5 text-brand-600" aria-label="Edited" />}
                  {can("editor") && (
                    <button type="button" onClick={() => remove(m)} className="rounded p-1 text-fg-muted opacity-0 hover:bg-gray-100 hover:text-red-600 focus:opacity-100 group-hover:opacity-100" aria-label={`Delete ${m.name}`}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
