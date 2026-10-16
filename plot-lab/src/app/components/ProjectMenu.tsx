import { Clock, Copy, FilePlus, FolderOpen, Save } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { getAlgorithm } from "../../algorithms/registry";
import { duplicateProject, newProject, openProjectFile, openRecent, saveProject } from "../../project/actions";
import { useLibrary } from "../../store/library";
import { useSettings } from "../../store/settings";

export function ProjectMenu({ onNotice }: { onNotice: (msg: string) => void }) {
  const [open, setOpen] = useState(false), ref = useRef<HTMLDivElement>(null), file = useRef<HTMLInputElement>(null);
  const name = useSettings((s) => s.projectName), setName = useSettings((s) => s.setProjectName), recent = useLibrary((s) => s.recent);
  useEffect(() => {
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  const item = "flex w-full items-center gap-2 px-3 py-1.5 text-left text-fg hover:bg-raised";
  return (
    <div ref={ref} className="relative flex items-center gap-1.5">
      <input aria-label="Project name" value={name} onChange={(e) => setName(e.target.value)}
        className="w-40 rounded border border-transparent bg-transparent px-1.5 py-0.5 text-[12.5px] text-fg hover:border-line focus:border-line" />
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="menu"
        className="flex items-center gap-1.5 rounded-md border border-line bg-raised px-2.5 py-1.5 text-muted hover:text-fg">
        <FolderOpen size={14} /> Project
      </button>
      <input ref={file} type="file" accept=".json,application/json" hidden aria-label="Open project file"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          const err = await openProjectFile(f);
          onNotice(err ?? `Opened ${f.name}`);
        }} />
      {open && (
        <div role="menu" className="absolute top-full left-0 z-40 mt-1 w-64 overflow-hidden rounded-lg border border-line bg-panel py-1 shadow-2xl">
          <button role="menuitem" type="button" className={item} onClick={() => { newProject(); setOpen(false); onNotice("New project"); }}><FilePlus size={14} /> New project</button>
          <button role="menuitem" type="button" className={item} onClick={() => { file.current?.click(); setOpen(false); }}><FolderOpen size={14} /> Open project…</button>
          <button role="menuitem" type="button" className={item} onClick={() => { onNotice(`Saved ${saveProject()}`); setOpen(false); }}><Save size={14} /> Save project</button>
          <button role="menuitem" type="button" className={item} onClick={() => { duplicateProject(); setOpen(false); onNotice("Duplicated — save to keep the copy"); }}><Copy size={14} /> Duplicate project</button>
          <div className="mt-1 border-t border-line px-3 pt-2 pb-1 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-faint">Recent</div>
          {recent.length === 0 && <div className="px-3 py-1 text-[12px] text-faint">Saved projects appear here.</div>}
          {recent.map((r) => (
            <button key={r.name} role="menuitem" type="button" className={item} title="Reference images aren't kept in Recent — open the saved file to restore them."
              onClick={() => { const err = openRecent(r.json); setOpen(false); onNotice(err ?? `Opened ${r.name}`); }}>
              <Clock size={13} className="shrink-0 text-faint" />
              <span className="min-w-0 flex-1 truncate">{r.name}</span>
              <span className="shrink-0 text-[10.5px] text-faint">{getAlgorithm(r.algorithmId)?.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
