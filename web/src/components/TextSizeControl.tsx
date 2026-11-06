import clsx from "clsx";
import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { TEXT_SIZES, TextSize, useTextSize } from "../lib/textSize";
import { useAuth } from "../context/AuthContext";

/** Lets each person choose a comfortable text size. Applies instantly, saved to their account. */
export function TextSizeControl({ compact }: { compact?: boolean }) {
  const [size, setSize] = useTextSize();
  const { user } = useAuth();
  const pick = (s: TextSize) => {
    setSize(s);
    if (user) updateDoc(doc(db, "users", user.uid), { textSize: s, updatedAt: serverTimestamp() }).catch(() => undefined);
  };
  return (
    <div role="radiogroup" aria-label="Text size" className={clsx("grid grid-cols-4 gap-1 rounded-xl bg-gray-100 p-1", compact ? "" : "max-w-md")}>
      {TEXT_SIZES.map((t, i) => (
        <button
          key={t.id}
          type="button"
          role="radio"
          aria-checked={size === t.id}
          aria-label={t.label}
          title={t.label}
          onClick={() => pick(t.id)}
          className={clsx(
            "flex flex-col items-center justify-center rounded-lg py-2 font-semibold leading-none transition-all",
            size === t.id ? "bg-white text-fg shadow-[0_1px_3px_rgba(11,13,14,0.12)]" : "text-fg-muted hover:text-fg",
          )}
        >
          <span style={{ fontSize: `${0.8 + i * 0.18}rem` }}>A</span>
          {!compact && <span className="mt-1 text-[0.68rem] font-medium">{t.label}</span>}
        </button>
      ))}
    </div>
  );
}
