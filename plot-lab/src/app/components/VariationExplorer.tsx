import { Bookmark, Check, Shuffle, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { getAlgorithm } from "../../algorithms/registry";
import type { GeometryCollection } from "../../geometry/types";
import { type Variation, type VariationMode, makeVariations } from "../../project/variations";
import { pathsToPath2D } from "../../render/preview";
import { requestFromSettings } from "../../store/generation";
import { useLibrary } from "../../store/library";
import { currentParams, useSettings } from "../../store/settings";
import type { WorkerRequest, WorkerResponse } from "../../worker/protocol";
import GenerateWorker from "../../worker/generate.worker.ts?worker";
import { metres } from "../format";

type Cell = { v: Variation; geometry?: GeometryCollection; ink?: number; paths?: number; error?: string };

function Preview({ g, w, h }: { g?: GeometryCollection; w: number; h: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1), ctx = cv.getContext("2d")!;
    cv.width = w * dpr; cv.height = h * dpr;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, cv.width, cv.height);
    if (!g) return;
    const k = (w * dpr) / g.widthMm;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.strokeStyle = "#111";
    ctx.lineWidth = 0.6 / k;
    ctx.stroke(pathsToPath2D(g.paths));
  }, [g, w, h]);
  return <canvas ref={ref} style={{ width: w, height: h }} className="block" />;
}

/** Generates every variation as real geometry in background workers (a few at a time). */
export function VariationExplorer({ onClose, onNotice }: { onClose: () => void; onNotice: (m: string) => void }) {
  const s = useSettings(), algo = getAlgorithm(s.algorithmId)!, addPreset = useLibrary((x) => x.addPreset);
  const [count, setCount] = useState(4), [mode, setMode] = useState<VariationMode>("seed"), [amount, setAmount] = useState(0.15), [round, setRound] = useState(0);
  const [selected, setSelected] = useState(0);
  const base = useMemo(() => ({ request: requestFromSettings(), params: currentParams(useSettings.getState()), seed: useSettings.getState().seed }), []);
  const variations = useMemo(() => makeVariations(algo, base.params, base.seed, count, mode, amount, round), [algo, base, count, mode, amount, round]);
  const [cells, setCells] = useState<Cell[]>([]);

  useEffect(() => {
    setCells(variations.map((v) => ({ v })));
    setSelected(0);
    const queue = variations.map((v, i) => ({ v, i })), workers: Worker[] = [];
    const run = (w: Worker) => {
      const job = queue.shift();
      if (!job) { w.terminate(); return; }
      w.onmessage = (e: MessageEvent<WorkerResponse>) => {
        const m = e.data;
        if (m.type === "done") { setCells((c) => c.map((x, k) => (k === job.i ? { ...x, geometry: m.geometry, ink: m.after.penDown, paths: m.after.paths } : x))); run(w); }
        else if (m.type === "error") { setCells((c) => c.map((x, k) => (k === job.i ? { ...x, error: m.message } : x))); run(w); }
      };
      w.postMessage({ type: "generate", job: job.i, ...base.request, params: job.v.params, seed: job.v.seed, optimize: { ...base.request.optimize, order: false } } satisfies WorkerRequest);
    };
    const n = Math.min(variations.length, Math.max(1, Math.min(3, (navigator.hardwareConcurrency || 4) - 1)));
    for (let k = 0; k < n; k++) { const w = new GenerateWorker(); workers.push(w); run(w); }
    return () => workers.forEach((w) => w.terminate());
  }, [variations, base]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);

  const sheet = cells[0]?.geometry, aspect = sheet ? sheet.heightMm / sheet.widthMm : 1.414;
  const cellW = count === 4 ? 240 : 170, cellH = Math.round(cellW * aspect);
  const pick = cells[selected];
  const apply = () => {
    if (!pick) return;
    s.setParams(algo.id, pick.v.params);
    s.setSeed(pick.v.seed);
    onNotice(`Applied variation ${selected + 1}`);
    onClose();
  };
  const savePreset = () => {
    if (!pick) return;
    const p = addPreset({ name: `${algo.name} variation ${pick.v.seed}`, algorithmId: algo.id, params: pick.v.params, seed: pick.v.seed });
    onNotice(`Saved preset “${p.name}”`);
  };
  const seg = (on: boolean) => `px-2.5 py-1 text-[12px] ${on ? "bg-raised text-fg shadow-[0_0_0_1px_var(--color-line)]" : "text-muted"} rounded`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Variations" onClick={(e) => e.stopPropagation()}
        className="grid max-h-full max-w-6xl grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-xl border border-line bg-panel shadow-2xl">
        <header className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
          <h2 className="mr-auto text-[14px] font-semibold">Variations · {algo.name}</h2>
          <div className="flex rounded-md border border-line bg-bg p-0.5" role="group" aria-label="Count">
            {[4, 9].map((n) => <button key={n} type="button" aria-pressed={count === n} className={seg(count === n)} onClick={() => setCount(n)}>{n}</button>)}
          </div>
          <div className="flex rounded-md border border-line bg-bg p-0.5" role="group" aria-label="Mode">
            {([["seed", "New seeds"], ["mutate", "Mutate parameters"], ["both", "Both"]] as const).map(([m, l]) =>
              <button key={m} type="button" aria-pressed={mode === m} className={seg(mode === m)} onClick={() => setMode(m)}>{l}</button>)}
          </div>
          {mode !== "seed" && <label className="flex items-center gap-2 text-[12px] text-muted">Amount
            <input type="range" min={0.02} max={0.5} step={0.01} value={amount} onChange={(e) => setAmount(Number(e.target.value))} aria-label="Mutation amount" className="w-24" />
            <span className="w-8 font-mono">{Math.round(amount * 100)}%</span></label>}
          <button type="button" onClick={() => setRound(round + 1)} className="flex items-center gap-1.5 rounded-md border border-line bg-raised px-2.5 py-1 text-[12px] text-fg"><Shuffle size={13} /> Shuffle</button>
          <button type="button" onClick={onClose} aria-label="Close" className="text-muted hover:text-fg"><X size={16} /></button>
        </header>
        <div className="overflow-auto p-4">
          <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${count === 4 ? 4 : 5}, ${cellW}px)` }}>
            {cells.map((c, i) => (
              <button key={i} type="button" onClick={() => setSelected(i)} onDoubleClick={apply} aria-pressed={selected === i} data-testid="variation"
                className={`rounded-lg border p-1.5 text-left transition-colors ${selected === i ? "border-accent bg-accent/10" : "border-line hover:border-faint"}`}>
                <div className="relative overflow-hidden rounded" style={{ width: cellW, height: cellH }}>
                  <Preview g={c.geometry} w={cellW} h={cellH} />
                  {!c.geometry && !c.error && <div className="absolute inset-0 flex items-center justify-center bg-white/70 text-[12px] text-neutral-500">Generating…</div>}
                  {c.error && <div className="absolute inset-0 flex items-center justify-center bg-white p-2 text-center text-[11px] text-red-600">{c.error}</div>}
                </div>
                <div className="mt-1 flex justify-between font-mono text-[10.5px] text-faint">
                  <span>seed {c.v.seed}</span>
                  <span data-testid="variation-stats">{c.paths !== undefined ? `${c.paths} paths · ${metres(c.ink!)}` : ""}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
        <footer className="flex items-center gap-2 border-t border-line px-4 py-3">
          <span className="flex-1 text-[12px] text-muted">Each variation is real geometry. Double-click or Apply to use one.</span>
          <button type="button" disabled={!pick?.geometry} onClick={savePreset} className="flex items-center gap-1.5 rounded-md border border-line bg-raised px-3 py-1.5 text-fg disabled:opacity-40"><Bookmark size={14} /> Save as preset</button>
          <button type="button" disabled={!pick?.geometry} onClick={apply} className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 font-medium text-black disabled:opacity-40"><Check size={14} /> Apply</button>
        </footer>
      </div>
    </div>
  );
}
