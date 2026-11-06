import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "./firebase";

/**
 * Feature flags live in the Firestore document `config/flags`, so they can be
 * switched on or off from the Firebase console without a redeploy.
 *   photoEditor: Media library, photo editor, photo backgrounds for quote graphics
 */
export interface Flags {
  photoEditor: boolean;
}

const KEY = "selah.flags";
const DEFAULTS: Flags = { photoEditor: false };

function cached(): Flags {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || "{}") };
  } catch {
    return DEFAULTS;
  }
}

let current: Flags = cached();
const listeners = new Set<(f: Flags) => void>();
let started = false;

function start() {
  if (started) return;
  started = true;
  onSnapshot(
    doc(db, "config", "flags"),
    (snap) => {
      const d = snap.data() || {};
      current = { photoEditor: d.photoEditor === true };
      try {
        localStorage.setItem(KEY, JSON.stringify(current));
      } catch {
        /* storage unavailable */
      }
      listeners.forEach((l) => l(current));
    },
    () => {
      /* keep last known flags */
    },
  );
}

export function useFlags(): Flags {
  const [f, setF] = useState(current);
  useEffect(() => {
    start();
    listeners.add(setF);
    setF(current);
    return () => {
      listeners.delete(setF);
    };
  }, []);
  return f;
}
