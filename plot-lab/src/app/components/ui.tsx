import { ChevronDown, ChevronRight, RotateCcw } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";

export function Section({ title, defaultOpen = true, children, aside }: { title: string; defaultOpen?: boolean; children: ReactNode; aside?: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="border-b border-line">
      <div className="flex items-center">
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open}
          className="flex flex-1 items-center gap-1.5 px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted hover:text-fg">
          {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          {title}
        </button>
        {aside && <div className="pr-3">{aside}</div>}
      </div>
      {open && <div className="grid gap-3 px-3 pb-3">{children}</div>}
    </section>
  );
}

export function IconButton({ label, onClick, disabled, active, children, className = "" }: {
  label: string; onClick?: () => void; disabled?: boolean; active?: boolean; children: ReactNode; className?: string;
}) {
  return (
    <button type="button" title={label} aria-label={label} aria-pressed={active} onClick={onClick} disabled={disabled}
      className={`inline-flex h-7 min-w-7 items-center justify-center gap-1.5 rounded-md border px-1.5 transition-colors disabled:cursor-default disabled:opacity-35 ${
        active ? "border-accent/60 bg-accent/15 text-accent" : "border-line bg-raised text-muted hover:border-faint hover:text-fg"} ${className}`}>
      {children}
    </button>
  );
}

const ResetButton = ({ onClick, visible }: { onClick: () => void; visible: boolean }) => (
  <button type="button" onClick={onClick} title="Reset to default" aria-label="Reset to default"
    className={`text-faint hover:text-accent ${visible ? "" : "invisible"}`}>
    <RotateCcw size={11} />
  </button>
);

/** Slider + exact number entry. Commits on every slider move; the number field commits on Enter/blur. */
export function NumberControl({ id, label, description, value, min, max, step, unit, defaultValue, onChange, onReset }: {
  id: string; label: string; description?: string; value: number; min: number; max: number; step: number; unit?: string;
  defaultValue?: number; onChange: (v: number) => void; onReset?: () => void;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const commit = () => {
    const v = Number(text);
    if (Number.isFinite(v)) onChange(Math.min(max, Math.max(min, Math.round(v / step) * step)));
    else setText(String(value));
  };
  return (
    <div className="grid gap-1" data-control={id}>
      <div className="flex items-center gap-1.5">
        <label htmlFor={`n-${id}`} title={description} className="flex-1 truncate text-muted">{label}</label>
        {onReset && <ResetButton onClick={onReset} visible={defaultValue !== undefined && value !== defaultValue} />}
        <input id={`n-${id}`} type="number" value={text} min={min} max={max} step={step}
          onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === "Enter" && commit()}
          className="w-[4.75rem] rounded border border-line bg-bg px-1.5 py-0.5 text-right font-mono text-[12px] text-fg tabular-nums" />
        {unit && <span className="w-14 truncate font-mono text-[11px] text-faint">{unit}</span>}
      </div>
      <input type="range" aria-label={label} value={value} min={min} max={max} step={step}
        onChange={(e) => onChange(Number(e.target.value))} className="w-full" />
    </div>
  );
}

export function SelectControl({ id, label, description, value, options, onChange }: {
  id: string; label: string; description?: string; value: string; options: { value: string; label: string }[]; onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-2" data-control={id}>
      <label htmlFor={`s-${id}`} title={description} className="flex-1 text-muted">{label}</label>
      <select id={`s-${id}`} value={value} onChange={(e) => onChange(e.target.value)}
        className="w-[150px] rounded border border-line bg-bg px-1.5 py-1 text-fg">
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

export function ToggleControl({ id, label, description, value, onChange }: { id: string; label: string; description?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2" title={description} data-control={id}>
      <span className="flex-1 text-muted">{label}</span>
      <button type="button" role="switch" aria-checked={value} aria-label={label} onClick={() => onChange(!value)}
        className={`relative h-4 w-7 rounded-full transition-colors ${value ? "bg-accent" : "bg-line"}`}>
        <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-fg transition-all ${value ? "left-3.5" : "left-0.5"}`} />
      </button>
    </label>
  );
}

export function ColorControl({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2" data-control={id}>
      <label htmlFor={`c-${id}`} className="flex-1 text-muted">{label}</label>
      <span className="font-mono text-[11px] text-faint">{value}</span>
      <input id={`c-${id}`} type="color" value={value} onChange={(e) => onChange(e.target.value)}
        className="h-6 w-8 cursor-pointer rounded border border-line bg-bg p-0.5" />
    </div>
  );
}

export function Notice({ level, children }: { level: "error" | "warning" | "info"; children: ReactNode }) {
  const c = level === "error" ? "border-danger/40 bg-danger/10 text-danger" : level === "warning" ? "border-warn/40 bg-warn/10 text-warn" : "border-line bg-raised text-muted";
  return <div role={level === "info" ? undefined : "alert"} className={`rounded-md border px-2.5 py-2 text-[12px] leading-snug ${c}`}>{children}</div>;
}
