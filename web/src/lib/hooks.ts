import { useEffect, useRef, useState } from "react";
import { doc, onSnapshot, Query, DocumentReference } from "firebase/firestore";
import { getDownloadURL, ref } from "firebase/storage";
import { db, storage } from "./firebase";

export function useDocData<T>(path: string | null): { data: (T & { id: string }) | null; loading: boolean; error: string | null } {
  const [state, setState] = useState<{ data: (T & { id: string }) | null; loading: boolean; error: string | null }>({ data: null, loading: !!path, error: null });
  useEffect(() => {
    if (!path) {
      setState({ data: null, loading: false, error: null });
      return;
    }
    setState((s) => ({ ...s, loading: true }));
    return onSnapshot(
      doc(db, path) as DocumentReference,
      (snap) => setState({ data: snap.exists() ? ({ id: snap.id, ...snap.data() } as T & { id: string }) : null, loading: false, error: null }),
      (e) => setState({ data: null, loading: false, error: e.message }),
    );
  }, [path]);
  return state;
}

export function useQueryData<T>(q: Query | null, key: string): { data: (T & { id: string })[]; loading: boolean; error: string | null } {
  const [state, setState] = useState<{ data: (T & { id: string })[]; loading: boolean; error: string | null }>({ data: [], loading: !!q, error: null });
  const qRef = useRef(q);
  qRef.current = q;
  useEffect(() => {
    if (!qRef.current) {
      setState({ data: [], loading: false, error: null });
      return;
    }
    setState((s) => ({ ...s, loading: true }));
    return onSnapshot(
      qRef.current,
      (snap) => setState({ data: snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T & { id: string }), loading: false, error: null }),
      (e) => setState({ data: [], loading: false, error: e.message }),
    );
  }, [key]);
  return state;
}

const urlCache = new Map<string, string>();

/** Resolve a Storage path to a (permission-checked) download URL. */
export function useStorageUrl(path?: string | null) {
  const [url, setUrl] = useState<string | null>(path ? urlCache.get(path) || null : null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!path) {
      setUrl(null);
      return;
    }
    if (urlCache.has(path)) {
      setUrl(urlCache.get(path)!);
      return;
    }
    let alive = true;
    getDownloadURL(ref(storage, path))
      .then((u) => {
        urlCache.set(path, u);
        if (alive) setUrl(u);
      })
      .catch((e) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [path]);
  return { url, error };
}

export async function storageUrl(path: string) {
  if (urlCache.has(path)) return urlCache.get(path)!;
  const u = await getDownloadURL(ref(storage, path));
  urlCache.set(path, u);
  return u;
}

/** Warn before leaving the page with unsaved edits. */
export function useUnsavedWarning(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);
}

export function useMediaQuery(q: string) {
  const [m, setM] = useState(() => typeof window !== "undefined" && window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const h = () => setM(mq.matches);
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, [q]);
  return m;
}
