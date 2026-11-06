import { useEffect, useState } from "react";

export type TextSize = "small" | "default" | "large" | "xlarge";

export const TEXT_SIZES: { id: TextSize; label: string; sample: string }[] = [
  { id: "small", label: "Small", sample: "text-[0.85rem]" },
  { id: "default", label: "Medium", sample: "text-[1rem]" },
  { id: "large", label: "Large", sample: "text-[1.15rem]" },
  { id: "xlarge", label: "Extra large", sample: "text-[1.3rem]" },
];

const KEY = "selah.textSize";
const listeners = new Set<(s: TextSize) => void>();

function valid(v: unknown): v is TextSize {
  return v === "small" || v === "default" || v === "large" || v === "xlarge";
}

export function getTextSize(): TextSize {
  try {
    const v = localStorage.getItem(KEY);
    if (valid(v)) return v;
  } catch {
    /* storage unavailable */
  }
  return "small"; // smallest is the default
}

/** Apply a text size to the page and remember it on this device. */
export function applyTextSize(size: TextSize) {
  const html = document.documentElement;
  if (size === "small") html.removeAttribute("data-text-size");
  else html.setAttribute("data-text-size", size);
  try {
    localStorage.setItem(KEY, size);
  } catch {
    /* storage unavailable */
  }
  listeners.forEach((l) => l(size));
}

export function useTextSize(): [TextSize, (s: TextSize) => void] {
  const [size, setSize] = useState<TextSize>(getTextSize);
  useEffect(() => {
    listeners.add(setSize);
    return () => {
      listeners.delete(setSize);
    };
  }, []);
  return [size, applyTextSize];
}

export { valid as isTextSize };
