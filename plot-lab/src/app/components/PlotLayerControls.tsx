import { ArrowDownUp, Eye, EyeOff, FileUp, PenTool, Trash2, X } from "lucide-react";
import { useRef } from "react";
import { sheetFor } from "../../core/paper";
import { isValidMask } from "../../geometry/mask";
import { DEFAULT_PLOT_LAYERS, autoPrimeArea, cleanLayerName } from "../../plotter/plotLayers";
import { useGeneration } from "../../store/generation";
import { useImported } from "../../store/imported";
import { usePlotView } from "../../store/plotView";
import { useSettings } from "../../store/settings";
import { metres } from "../format";
import { IconButton, Notice, NumberControl, SelectControl, ToggleControl } from "./ui";

const Sub = ({ children }: { children: string }) => <div className="mt-1 border-t border-line pt-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-faint">{children}</div>;
const small = "flex items-center gap-1 rounded border border-line bg-raised px-2 py-0.5 text-[11.5px] text-muted hover:text-fg disabled:opacity-40";

/** Ink per layer against one pump's safe budget. */
function InkBars() {
  const report = useGeneration((s) => s.plotLayers), colors = useGeneration((s) => s.geometry?.layers);
  const hidden = usePlotView((s) => s.hidden), toggle = usePlotView((s) => s.toggleLayer);
  if (!report?.layers.length) return null;
  const scale = report.budgetMm || Math.max(...report.layers.map((l) => l.inkMm));
  return (
    <div className="grid gap-1.5" data-testid="ink-bars">
      {report.layers.map((l) => {
        const f = l.inkMm / scale, color = colors?.find((x) => x.id === l.id)?.stroke ?? "#888";
        return (
          <div key={l.id} className="grid gap-0.5">
            <div className="flex items-center gap-1.5 font-mono text-[11px] tabular-nums">
              <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: color }} />
              <span className="min-w-0 flex-1 truncate text-fg">{l.number} {l.name}</span>
              <span className={l.overBudget ? "text-danger" : "text-faint"}>{metres(l.inkMm)}{report.budgetMm ? ` / ${metres(report.budgetMm)}` : ""}</span>
              <button type="button" onClick={() => toggle(l.number)} aria-label={`${hidden.includes(l.number) ? "Show" : "Hide"} layer ${l.number} in the preview`}
                className="text-muted hover:text-fg">{hidden.includes(l.number) ? <EyeOff size={12} /> : <Eye size={12} />}</button>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-line" title={report.budgetMm ? "Ink against one pump × safety" : "Relative ink (enter ink per pump to see the budget)"}>
              <div className={`h-full ${l.overBudget ? "bg-danger" : "bg-accent"}`} style={{ width: `${Math.min(100, f * 100)}%` }} />
            </div>
          </div>
        );
      })}
      {!report.budgetMm && <p className="text-[11px] leading-snug text-faint">Enter "Ink per pump" below to compare each layer with one pump of the marker.</p>}
    </div>
  );
}

export function PlotLayerControls() {
  const pl = useSettings((s) => s.plotLayers), set = useSettings((s) => s.setPlotLayers), paper = useSettings((s) => s.paper);
  const report = useGeneration((s) => s.plotLayers), drawing = usePlotView((s) => s.drawing), setDrawing = usePlotView((s) => s.setDrawing);
  const seams = usePlotView((s) => s.seams), setSeams = usePlotView((s) => s.setSeams);
  const imported = useImported(), inputFile = useRef<HTMLInputElement>(null), maskFile = useRef<HTMLInputElement>(null);
  const sheet = sheetFor(paper), hasMask = isValidMask(pl.mask), d = DEFAULT_PLOT_LAYERS;
  const num = (id: keyof typeof d & string, label: string, min: number, max: number, step: number, description: string, unit = "mm") => (
    <NumberControl id={id} label={label} description={description} value={pl[id] as number} min={min} max={max} step={step} unit={unit}
      defaultValue={d[id] as number} onChange={(v) => set({ [id]: v })} onReset={() => set({ [id]: d[id] })} />
  );
  const prime = pl.prime, setPrime = (p: Partial<typeof prime>) => set({ prime: p });
  return (
    <>
      <ToggleControl id="plotLayersEnabled" label="Split into plot layers" value={pl.enabled} onChange={(v) => set({ enabled: v })}
        description="Split every line by a mask into numbered layers (1 object, 2 background) that AxiDraw Control plots one by one from its Layers tab, so the plot never pauses." />
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="flex-1 text-muted">Mask</span>
        <span className="font-mono text-[11px] text-faint" data-testid="mask-status">{hasMask ? `${pl.mask.length} points` : "none"}</span>
        <IconButton label={drawing ? "Stop drawing the mask" : "Draw the mask on the canvas: click for corners, drag for freehand, Enter or double-click to close"} active={drawing}
          onClick={() => setDrawing(!drawing)}><PenTool size={13} /><span className="text-[12px]">{drawing ? "Drawing…" : "Draw"}</span></IconButton>
        <IconButton label="Import the mask from an SVG layer named &quot;mask&quot;" onClick={() => maskFile.current?.click()}><FileUp size={13} /></IconButton>
        <IconButton label="Clear the mask" disabled={!pl.mask.length} onClick={() => set({ mask: [] })}><Trash2 size={13} /></IconButton>
        <input ref={maskFile} type="file" accept=".svg,image/svg+xml" hidden aria-label="Import mask SVG"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void imported.loadMask(f); e.target.value = ""; }} />
      </div>
      {pl.enabled && <>
        <div className="flex items-center gap-1.5">
          <span className="flex-1 text-muted" title="Split the current algorithm's drawing, or polylines imported from an SVG (e.g. an earlier Wave Portrait export).">Source</span>
          <span className="min-w-0 truncate font-mono text-[11px] text-faint" title={imported.svg?.name}>{imported.svg ? imported.svg.name : "this algorithm"}</span>
          <button type="button" className={small} onClick={() => inputFile.current?.click()}><FileUp size={12} /> SVG</button>
          {imported.svg && <button type="button" className={small} onClick={imported.clear} aria-label="Stop using the imported SVG"><X size={12} /></button>}
          <input ref={inputFile} type="file" accept=".svg,image/svg+xml" hidden aria-label="Import SVG to split"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void imported.loadInput(f); e.target.value = ""; }} />
        </div>
        {imported.error && <Notice level="error">{imported.error}</Notice>}
        {imported.notice && !imported.error && <p className="text-[11px] leading-snug text-faint">{imported.notice}</p>}

        <Sub>Layers (plot order)</Sub>
        {pl.layers.map((l, i) => (
          <div key={l.region} className="flex items-center gap-1.5" data-control={`plotLayer${i + 1}`}>
            <span className="w-4 font-mono text-[12px] text-faint">{i + 1}</span>
            <input aria-label={`Layer ${i + 1} name`} defaultValue={l.name} key={`${l.region}-${l.name}`}
              onBlur={(e) => { const name = cleanLayerName(e.target.value); if (name && name !== l.name) set({ layers: pl.layers.map((x) => (x === l ? { ...x, name } : x)) }); else e.target.value = l.name; }}
              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
              className="min-w-0 flex-1 rounded border border-line bg-bg px-1.5 py-0.5 text-[12px] text-fg" />
            <span className="w-14 text-[11px] text-faint">{l.region === "inside" ? "inside" : "outside"}</span>
          </div>
        ))}
        <button type="button" className={small} onClick={() => set({ layers: [pl.layers[1], pl.layers[0]] })}><ArrowDownUp size={12} /> Swap order</button>
        <InkBars />

        <Sub>Cuts</Sub>
        <SelectControl id="edgeMode" label="Edge" value={pl.edgeMode} onChange={(v) => set({ edgeMode: v as typeof pl.edgeMode })}
          description="Crisp: cuts follow the mask. Feathered: each row's cut moves outwards by a seeded random amount (where the line is flat), so the seam fades instead of forming a hard line."
          options={[{ value: "crisp", label: "Crisp" }, { value: "feathered", label: "Feathered" }]} />
        {pl.edgeMode === "feathered" && num("staggerMm", "Stagger", 0, 30, 0.1, "Largest outward shift of a feathered cut. Uses the seed.")}
        {num("flatThresholdMm", "Flat threshold", 0.005, 2, 0.005, "A cut only lands where the line stays this close to its row's baseline over 1 mm, so waves are never cut mid-oscillation.")}
        {num("snapSearchMm", "Snap search", 0, 30, 0.1, "How far along the row a cut may move to find a flat spot. Outwards (into the background) is preferred.")}
        {num("seamGapMm", "Seam gap", -2, 2, 0.05, "Space left between the layers at a seam (the background side moves). 0 = butt joint; negative overlaps, which can blot with POSCA.")}
        {num("minSegmentMm", "Min segment", 0, 20, 0.1, "Pieces shorter than this join the neighbouring layer.")}
        {num("simplifyToleranceMm", "Simplify", 0, 1, 0.01, "Ramer–Douglas–Peucker tolerance for the split lines. 0 = off.")}
        <ToggleControl id="plotSeams" label="Show seams" value={seams} onChange={setSeams} description="Small dots at every cut in the preview; flagged cuts (no flat spot found) in red." />
        {report && report.cuts > 0 && <p className="font-mono text-[11px] text-faint" data-testid="cut-stats">{report.cuts} cuts · {report.flagged} flagged</p>}

        <Sub>Ink budget</Sub>
        {num("inkPerPumpMm", "Ink per pump", 0, 1_000_000, 100, "Measure once: how much line one pump of the marker draws. 0 = not measured.")}
        {num("inkSafety", "Safety", 0.1, 1, 0.05, "Plan each layer to use at most this share of one pump.", "× pump")}
        <ToggleControl id="plotAutoSplit" label="Split over-budget layers" value={pl.autoSplit} onChange={(v) => set({ autoSplit: v })}
          description="A layer over budget becomes several numbered layers, split between rows (never mid-row). Prime between them." />

        <Sub>Priming strip</Sub>
        <ToggleControl id="primeEnabled" label="Prime at each layer's start" value={prime.enabled} onChange={(v) => setPrime({ enabled: v })}
          description="Zigzags and short dabs in the margin at the start of every layer, each layer in a fresh spot. Tape a scrap strip there." />
        {prime.enabled && <>
          <ToggleControl id="primeAuto" label="In the bottom margin" value={prime.auto} description="Off: set the strip's position and size yourself (sheet mm, on the page)."
            onChange={(v) => { const a = autoPrimeArea(sheet); setPrime(v || !a ? { auto: v } : { auto: v, x: a.x, y: a.y, width: a.width, height: a.height }); }} />
          {!prime.auto && <>
            <NumberControl id="primeX" label="X" value={prime.x} min={0} max={sheet.width} step={0.5} unit="mm" onChange={(v) => setPrime({ x: v })} />
            <NumberControl id="primeY" label="Y" value={prime.y} min={0} max={sheet.height} step={0.5} unit="mm" onChange={(v) => setPrime({ y: v })} />
            <NumberControl id="primeW" label="Width" value={prime.width} min={1} max={sheet.width} step={0.5} unit="mm" onChange={(v) => setPrime({ width: v })} />
            <NumberControl id="primeH" label="Height" value={prime.height} min={1} max={sheet.height} step={0.5} unit="mm" onChange={(v) => setPrime({ height: v })} />
          </>}
          <NumberControl id="primeZigzags" label="Zigzags" value={prime.zigzags} min={0} max={20} step={1} defaultValue={d.prime.zigzags} onChange={(v) => setPrime({ zigzags: v })} onReset={() => setPrime({ zigzags: d.prime.zigzags })} />
          <NumberControl id="primeDabs" label="Dabs" value={prime.dabs} min={0} max={100} step={1} defaultValue={d.prime.dabs} onChange={(v) => setPrime({ dabs: v })} onReset={() => setPrime({ dabs: d.prime.dabs })} />
        </>}
        {report?.issues.map((i) => <Notice key={i.code} level={i.level}>{i.message}</Notice>)}
      </>}
    </>
  );
}
