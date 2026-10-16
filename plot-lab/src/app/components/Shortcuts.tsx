import { X } from "lucide-react";
import { useEffect } from "react";

export const SHORTCUTS: [string, string][] = [
  ["G", "Generate now"],
  ["E", "Export SVG"],
  ["V", "Variation explorer"],
  ["R", "Random seed"],
  ["N", "Next variation (seed + 1)"],
  ["B", "Back to the previous seed"],
  ["L", "Lock / unlock the seed"],
  ["+ / −", "Zoom in / out"],
  ["0", "Fit to screen"],
  ["F", "Full screen preview"],
  ["M", "Show / hide margins"],
  ["P", "Show / hide path order"],
  ["⌘/Ctrl S", "Save project"],
  ["⌘/Ctrl O", "Open project"],
  ["?", "This list"],
  ["Esc", "Close a dialog"],
];

export function ShortcutsHelp({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Keyboard shortcuts" onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-xl border border-line bg-panel shadow-2xl">
        <header className="flex items-center border-b border-line px-4 py-3">
          <h2 className="flex-1 text-[14px] font-semibold">Keyboard shortcuts</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-muted hover:text-fg"><X size={16} /></button>
        </header>
        <dl className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-1.5 p-4">
          {SHORTCUTS.map(([k, d]) => (
            <div key={k} className="contents">
              <dt><kbd className="rounded border border-line bg-raised px-1.5 py-0.5 font-mono text-[11.5px] text-fg">{k}</kbd></dt>
              <dd className="text-muted">{d}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
