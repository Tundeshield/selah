import { ButtonHTMLAttributes, forwardRef, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes, useEffect, useId, useRef, createContext, useContext, useState, useCallback } from "react";
import clsx from "clsx";
import { Loader2, X, CheckCircle2, AlertCircle, Info } from "lucide-react";
import type { Tone } from "../lib/constants";

// ---------- Button ----------
// primary = ink (default action in the app) · accent = Selah teal (hero CTAs, highlights)
type Variant = "primary" | "secondary" | "ghost" | "danger" | "gold" | "accent";
interface BtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  icon?: ReactNode;
}
export const Button = forwardRef<HTMLButtonElement, BtnProps>(function Button(
  { variant = "primary", size = "md", loading, icon, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={clsx(
        "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl font-medium transition-all disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" && "h-9 px-3.5 text-[0.85rem]",
        size === "md" && "h-11 px-5 text-[0.94rem]",
        size === "lg" && "h-12 px-6 text-base",
        variant === "primary" && "bg-ink text-white hover:bg-ink-700 active:bg-ink-600",
        variant === "secondary" && "border border-gray-300/80 bg-white text-fg hover:border-gray-400 hover:bg-gray-50",
        variant === "ghost" && "text-fg hover:bg-gray-200/60",
        variant === "danger" && "bg-red-600 text-white hover:bg-red-700",
        (variant === "gold" || variant === "accent") && "bg-brand-400 text-ink hover:bg-brand-300",
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
});

// ---------- Form fields ----------
interface FieldWrap {
  label?: string;
  hint?: ReactNode;
  error?: string | null;
}
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & FieldWrap>(function Input(
  { label, hint, error, className, id, ...rest },
  ref,
) {
  const auto = useId();
  const fid = id || auto;
  return (
    <div className={className}>
      {label && <label htmlFor={fid} className="label">{label}{rest.required && <span className="text-brand-600"> *</span>}</label>}
      <input ref={ref} id={fid} aria-invalid={!!error} aria-describedby={error ? `${fid}-err` : undefined} className={clsx("field", error && "border-red-400")} {...rest} />
      {error ? <p id={`${fid}-err`} className="mt-1.5 text-[0.8rem] text-red-600">{error}</p> : hint ? <p className="hint">{hint}</p> : null}
    </div>
  );
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & FieldWrap>(function Textarea(
  { label, hint, error, className, id, ...rest },
  ref,
) {
  const auto = useId();
  const fid = id || auto;
  return (
    <div className={className}>
      {label && <label htmlFor={fid} className="label">{label}</label>}
      <textarea ref={ref} id={fid} aria-invalid={!!error} className={clsx("field min-h-[6rem]", error && "border-red-400")} {...rest} />
      {error ? <p className="mt-1.5 text-[0.8rem] text-red-600">{error}</p> : hint ? <p className="hint">{hint}</p> : null}
    </div>
  );
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & FieldWrap>(function Select(
  { label, hint, error, className, id, children, ...rest },
  ref,
) {
  const auto = useId();
  const fid = id || auto;
  return (
    <div className={className}>
      {label && <label htmlFor={fid} className="label">{label}</label>}
      <select ref={ref} id={fid} className="field pr-9" {...rest}>
        {children}
      </select>
      {error ? <p className="mt-1.5 text-[0.8rem] text-red-600">{error}</p> : hint ? <p className="hint">{hint}</p> : null}
    </div>
  );
});

// ---------- Badge ----------
const toneClass: Record<Tone, string> = {
  muted: "bg-gray-200/80 text-gray-700",
  progress: "bg-gray-200/80 text-gray-700",
  good: "bg-brand-100 text-brand-900",
  forest: "bg-ink text-white",
  bad: "bg-red-100 text-red-800",
  warn: "bg-amber-100 text-amber-900",
  gold: "bg-sky-100 text-sky-900",
};
export function Badge({ tone = "muted", children, pulse, className }: { tone?: Tone; children: ReactNode; pulse?: boolean; className?: string }) {
  return (
    <span className={clsx("inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[0.75rem] font-medium", toneClass[tone], className)}>
      {pulse && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}

// ---------- Card / layout bits ----------
export function Card({ children, className, ...rest }: { children: ReactNode; className?: string } & React.HTMLAttributes<HTMLDivElement>) {
  return <div className={clsx("card", className)} {...rest}>{children}</div>;
}

export function PageHeader({ title, subtitle, actions, eyebrow }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        {eyebrow && <div className="eyebrow mb-2.5">{eyebrow}</div>}
        <h1 className="h-page">{title}</h1>
        {subtitle && <p className="mt-2 max-w-2xl text-base text-fg-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="relative flex flex-col items-center overflow-hidden rounded-2xl border border-gray-200 bg-white px-6 py-16 text-center">
      {icon && (
        <div className="relative mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-ink text-brand-300">
          <span className="absolute inset-0 -z-0 rounded-2xl shadow-glow" aria-hidden />
          <span className="relative">{icon}</span>
        </div>
      )}
      <h3 className="font-wide text-2xl font-semibold tracking-[-0.02em] text-fg" style={{ fontStretch: "115%" }}>{title}</h3>
      {children && <p className="mt-2 max-w-md text-[0.94rem] text-fg-muted">{children}</p>}
      {action && <div className="mt-7">{action}</div>}
    </div>
  );
}

export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <div role="status" className="flex items-center gap-2 text-sm text-fg-muted">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> {label}…
    </div>
  );
}

export function PageLoading() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <Spinner />
    </div>
  );
}

export function Notice({ tone = "info", title, children, action }: { tone?: "info" | "warn" | "error" | "success"; title?: string; children?: ReactNode; action?: ReactNode }) {
  const Icon = tone === "success" ? CheckCircle2 : tone === "info" ? Info : AlertCircle;
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={clsx(
        "flex gap-3 rounded-xl border px-4 py-3.5 text-[0.9rem]",
        tone === "info" && "border-gray-200 bg-white text-fg",
        tone === "warn" && "border-amber-200 bg-amber-50 text-amber-950",
        tone === "error" && "border-red-200 bg-red-50 text-red-900",
        tone === "success" && "border-brand-200 bg-brand-50 text-brand-950",
      )}
    >
      <Icon className={clsx("mt-0.5 h-4 w-4 shrink-0", tone === "info" && "text-brand-600")} aria-hidden />
      <div className="min-w-0 flex-1">
        {title && <div className="font-semibold">{title}</div>}
        {children && <div className={clsx(title && "mt-0.5", "leading-relaxed")}>{children}</div>}
      </div>
      {action && <div className="shrink-0 self-center">{action}</div>}
    </div>
  );
}

// ---------- Modal ----------
export function Modal({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    setTimeout(() => ref.current?.querySelector<HTMLElement>("input,textarea,select,button[data-autofocus]")?.focus(), 30);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", h);
      document.body.style.overflow = "";
      prev?.focus?.();
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/50 p-0 backdrop-blur-sm sm:items-center sm:p-6" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title} className={clsx("flex max-h-[92vh] w-full flex-col rounded-t-3xl bg-white shadow-pop sm:rounded-2xl", wide ? "sm:max-w-2xl" : "sm:max-w-lg")}>
        <div className="flex items-center justify-between px-6 pb-2 pt-5">
          <h2 className="h-section text-xl">{title}</h2>
          <button onClick={onClose} className="rounded-full p-1.5 text-fg-muted hover:bg-gray-100 hover:text-fg" aria-label="Close dialog">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-6 py-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-gray-200 px-6 py-4">{footer}</div>}
      </div>
    </div>
  );
}

// ---------- Tabs (segmented pill) ----------
export function Tabs<T extends string>({ tabs, value, onChange, className }: { tabs: { id: T; label: string; count?: number }[]; value: T; onChange: (v: T) => void; className?: string }) {
  return (
    <div className={clsx("scrollbar-thin -mx-1 overflow-x-auto px-1 pb-1", className)}>
      <div role="tablist" className="inline-flex gap-1 rounded-full bg-gray-200/70 p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={value === t.id}
            onClick={() => onChange(t.id)}
            className={clsx(
              "inline-flex shrink-0 items-center gap-1.5 rounded-full px-4 py-1.5 text-[0.88rem] font-medium transition-all",
              value === t.id ? "bg-white text-fg shadow-[0_1px_3px_rgba(11,13,14,0.12)]" : "text-fg-muted hover:text-fg",
            )}
          >
            {t.label}
            {t.count !== undefined && <span className={clsx("rounded-full px-1.5 text-[0.7rem] font-semibold tabular-nums", value === t.id ? "bg-ink text-white" : "bg-gray-300/70 text-gray-700")}>{t.count}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------- Toasts ----------
interface Toast { id: number; tone: "success" | "error" | "info"; text: string }
const ToastCtx = createContext<(text: string, tone?: Toast["tone"]) => void>(() => {});
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((text: string, tone: Toast["tone"] = "success") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, tone, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === "error" ? 7000 : 4000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed bottom-24 left-1/2 z-[60] flex w-[min(92vw,440px)] -translate-x-1/2 flex-col gap-2 md:bottom-6">
        {toasts.map((t) => (
          <div key={t.id} className={clsx("pointer-events-auto flex items-start gap-2.5 rounded-2xl px-4 py-3 text-[0.9rem] shadow-pop", t.tone === "error" ? "bg-red-700 text-white" : "bg-ink text-white")}>
            {t.tone === "error" ? <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-300" />}
            <span>{t.text}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

export function Checkbox({ checked, onChange, label, className }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; className?: string }) {
  return (
    <label className={clsx("flex cursor-pointer items-start gap-2.5 text-[0.94rem] text-fg", className)}>
      <input type="checkbox" className="mt-1 h-4 w-4 rounded border-gray-300" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}
