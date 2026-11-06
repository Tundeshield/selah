import { ButtonHTMLAttributes, forwardRef, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes, useEffect, useId, useRef, createContext, useContext, useState, useCallback } from "react";
import clsx from "clsx";
import { Loader2, X, CheckCircle2, AlertCircle, Info } from "lucide-react";
import type { Tone } from "../lib/constants";

// ---------- Button ----------
type Variant = "primary" | "secondary" | "ghost" | "danger" | "gold";
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
        "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-55",
        size === "sm" && "h-8 px-3 text-[13px]",
        size === "md" && "h-10 px-4 text-sm",
        size === "lg" && "h-12 px-5 text-[15px]",
        variant === "primary" && "bg-forest text-cream hover:bg-forest-600",
        variant === "secondary" && "border border-cream-300 bg-white text-forest hover:border-sage-300 hover:bg-sage-50",
        variant === "ghost" && "text-forest hover:bg-sage-100",
        variant === "danger" && "bg-[#8E3B2F] text-white hover:bg-[#7A3227]",
        variant === "gold" && "bg-gold text-forest-900 hover:bg-[#B89558]",
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
      {label && <label htmlFor={fid} className="label">{label}{rest.required && <span className="text-gold-700"> *</span>}</label>}
      <input ref={ref} id={fid} aria-invalid={!!error} aria-describedby={error ? `${fid}-err` : undefined} className={clsx("field", error && "border-[#B5544A]")} {...rest} />
      {error ? <p id={`${fid}-err`} className="mt-1 text-xs text-[#9A3B30]">{error}</p> : hint ? <p className="hint">{hint}</p> : null}
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
      <textarea ref={ref} id={fid} aria-invalid={!!error} className={clsx("field min-h-[96px] leading-relaxed", error && "border-[#B5544A]")} {...rest} />
      {error ? <p className="mt-1 text-xs text-[#9A3B30]">{error}</p> : hint ? <p className="hint">{hint}</p> : null}
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
      <select ref={ref} id={fid} className="field pr-8" {...rest}>
        {children}
      </select>
      {error ? <p className="mt-1 text-xs text-[#9A3B30]">{error}</p> : hint ? <p className="hint">{hint}</p> : null}
    </div>
  );
});

// ---------- Badge ----------
const toneClass: Record<Tone, string> = {
  muted: "bg-cream-200 text-charcoal-500",
  progress: "bg-sage-100 text-sage-700",
  good: "bg-sage-200 text-forest",
  forest: "bg-forest text-cream",
  bad: "bg-[#F6E3DF] text-[#8E3B2F]",
  warn: "bg-gold-100 text-gold-700",
  gold: "bg-gold-50 text-gold-700 ring-1 ring-gold/40",
};
export function Badge({ tone = "muted", children, pulse, className }: { tone?: Tone; children: ReactNode; pulse?: boolean; className?: string }) {
  return (
    <span className={clsx("inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium", toneClass[tone], className)}>
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
        {eyebrow && <div className="mb-2 text-xs font-medium uppercase tracking-[0.14em] text-gold-700">{eyebrow}</div>}
        <h1 className="h-page">{title}</h1>
        {subtitle && <p className="mt-2 max-w-2xl text-[15px] text-charcoal-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed border-cream-300 bg-cream-50 px-6 py-14 text-center">
      {icon && <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-sage-100 text-forest">{icon}</div>}
      <h3 className="font-serif text-2xl text-forest">{title}</h3>
      {children && <p className="mt-2 max-w-md text-sm text-charcoal-500">{children}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <div role="status" className="flex items-center gap-2 text-sm text-charcoal-400">
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
        "flex gap-3 rounded-xl border px-4 py-3 text-sm",
        tone === "info" && "border-sage-300 bg-sage-50 text-forest",
        tone === "warn" && "border-gold/40 bg-gold-50 text-[#6B5530]",
        tone === "error" && "border-[#E8C4BD] bg-[#FBEFEC] text-[#7A3227]",
        tone === "success" && "border-sage-300 bg-sage-100 text-forest",
      )}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-forest-900/40 p-0 backdrop-blur-[2px] sm:items-center sm:p-6" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title} className={clsx("flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-white shadow-pop sm:rounded-2xl", wide ? "sm:max-w-2xl" : "sm:max-w-lg")}>
        <div className="flex items-center justify-between border-b border-cream-200 px-6 py-4">
          <h2 className="font-serif text-xl text-forest">{title}</h2>
          <button onClick={onClose} className="rounded-md p-1 text-charcoal-400 hover:bg-cream-200 hover:text-forest" aria-label="Close dialog">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-6 py-5">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-cream-200 px-6 py-4">{footer}</div>}
      </div>
    </div>
  );
}

// ---------- Tabs ----------
export function Tabs<T extends string>({ tabs, value, onChange, className }: { tabs: { id: T; label: string; count?: number }[]; value: T; onChange: (v: T) => void; className?: string }) {
  return (
    <div role="tablist" className={clsx("scrollbar-thin -mx-1 flex gap-1 overflow-x-auto px-1", className)}>
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={value === t.id}
          onClick={() => onChange(t.id)}
          className={clsx(
            "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
            value === t.id ? "bg-forest text-cream" : "text-charcoal-500 hover:bg-sage-100 hover:text-forest",
          )}
        >
          {t.label}
          {t.count !== undefined && <span className={clsx("rounded-full px-1.5 text-[11px]", value === t.id ? "bg-cream/20" : "bg-cream-200")}>{t.count}</span>}
        </button>
      ))}
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
      <div aria-live="polite" className="pointer-events-none fixed bottom-20 left-1/2 z-[60] flex w-[min(92vw,420px)] -translate-x-1/2 flex-col gap-2 md:bottom-6">
        {toasts.map((t) => (
          <div key={t.id} className={clsx("pointer-events-auto flex items-start gap-2 rounded-xl px-4 py-3 text-sm shadow-pop", t.tone === "error" ? "bg-[#7A3227] text-white" : "bg-forest text-cream")}>
            {t.tone === "error" ? <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-gold" />}
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
    <label className={clsx("flex cursor-pointer items-start gap-2.5 text-sm text-charcoal", className)}>
      <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-cream-300" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}
