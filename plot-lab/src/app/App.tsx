import { Download, Keyboard, LayoutGrid, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { ALGORITHMS, getAlgorithm } from "../algorithms/registry";
import { generateNow, loadThumbnails, startAutoGenerate, useGeneration } from "../store/generation";
import { useSettings } from "../store/settings";
import { Canvas } from "./components/Canvas";
import { ExportDialog } from "./components/ExportDialog";
import { Library } from "./components/Library";
import { ParamPanel } from "./components/ParamPanel";
import { ProjectMenu } from "./components/ProjectMenu";
import { ShortcutsHelp } from "./components/Shortcuts";
import { saveProject } from "../project/actions";
import { VariationExplorer } from "./components/VariationExplorer";
import { StatusBar } from "./components/StatusBar";
import { ToggleControl } from "./components/ui";

export function App() {
  const algorithmId = useSettings((s) => s.algorithmId), auto = useSettings((s) => s.auto), setAuto = useSettings((s) => s.setAuto);
  const status = useGeneration((s) => s.status), progress = useGeneration((s) => s.progress);
  const [exporting, setExporting] = useState(false), [exploring, setExploring] = useState(false), [notice, setNotice] = useState("");
  const [help, setHelp] = useState(false);

  // Global keyboard shortcuts (not while typing in a field or while a dialog is open).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = /^(INPUT|SELECT|TEXTAREA)$/.test((e.target as HTMLElement).tagName);
      const mod = e.metaKey || e.ctrlKey, key = e.key.toLowerCase();
      if (mod && key === "s") { e.preventDefault(); setNotice(`Saved ${saveProject()}`); return; }
      if (mod && key === "o") { e.preventDefault(); document.querySelector<HTMLInputElement>('input[aria-label="Open project file"]')?.click(); return; }
      if (typing || mod || e.altKey || document.querySelector('[role="dialog"]')) return;
      const s = useSettings.getState();
      const actions: Record<string, () => void> = {
        g: () => generateNow(), e: () => setExporting(true), v: () => setExploring(true), "?": () => setHelp(true),
        r: s.randomSeed, n: s.nextVariation, b: s.previousSeed, l: () => s.setSeedLocked(!s.seedLocked),
        m: () => s.setView({ margins: !s.view.margins }), p: () => s.setView({ pathViz: !s.view.pathViz }),
        f: () => { void document.querySelector('[data-testid="artwork"]')?.requestFullscreen(); },
      };
      const act = actions[e.key === "?" ? "?" : key];
      if (act) { e.preventDefault(); act(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => { if (!notice) return; const t = setTimeout(() => setNotice(""), 3500); return () => clearTimeout(t); }, [notice]);

  useEffect(() => {
    generateNow();
    loadThumbnails(ALGORITHMS.map((a) => a.id));
    return startAutoGenerate();
  }, []);

  return (
    <div className="grid h-full grid-cols-[260px_minmax(0,1fr)_330px] grid-rows-[46px_minmax(0,1fr)_30px]">
      <header className="col-span-3 flex items-center gap-4 border-b border-line bg-panel px-4">
        <div className="flex items-baseline gap-2">
          <span className="text-[13px] font-bold tracking-[0.28em]">PLOT LAB</span>
          <span className="text-[12px] text-faint">/ {getAlgorithm(algorithmId)?.name}</span>
        </div>
        <ProjectMenu onNotice={setNotice} />
        <div className="relative mx-auto h-1 w-40 overflow-hidden rounded-full bg-line" aria-hidden>
          <div className="h-full bg-accent transition-[width] duration-200" style={{ width: status === "generating" ? `${progress * 100}%` : "0%" }} />
        </div>
        <div className="w-24"><ToggleControl id="auto" label="Live" description="Regenerate automatically after every change" value={auto} onChange={setAuto} /></div>
        <button type="button" onClick={() => generateNow()}
          className="flex items-center gap-1.5 rounded-md border border-line bg-raised px-3 py-1.5 text-fg hover:border-faint">
          <RefreshCw size={14} className={status === "generating" ? "animate-spin" : ""} /> Generate
        </button>
        <button type="button" onClick={() => setHelp(true)} aria-label="Keyboard shortcuts" title="Keyboard shortcuts (?)"
          className="rounded-md border border-line bg-raised p-1.5 text-muted hover:text-fg"><Keyboard size={15} /></button>
        <button type="button" onClick={() => setExploring(true)}
          className="flex items-center gap-1.5 rounded-md border border-line bg-raised px-3 py-1.5 text-fg hover:border-faint">
          <LayoutGrid size={14} /> Variations
        </button>
        <button type="button" onClick={() => setExporting(true)}
          className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 font-medium text-black hover:brightness-110">
          <Download size={14} /> Export SVG
        </button>
      </header>
      <Library />
      <Canvas />
      <ParamPanel />
      <div className="col-span-3 grid"><StatusBar /></div>
      {exporting && <ExportDialog onClose={() => setExporting(false)} />}
      {help && <ShortcutsHelp onClose={() => setHelp(false)} />}
      {exploring && <VariationExplorer onClose={() => setExploring(false)} onNotice={setNotice} />}
      {notice && <div role="status" data-testid="notice" className="fixed bottom-10 left-1/2 z-50 -translate-x-1/2 rounded-md bg-fg px-3 py-1.5 text-[12.5px] text-bg shadow-lg">{notice}</div>}
    </div>
  );
}
