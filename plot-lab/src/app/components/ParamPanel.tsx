import { Lock, LockOpen, RotateCcw, Shuffle, SkipForward, Undo2 } from "lucide-react";
import { getAlgorithm } from "../../algorithms/registry";
import { PARAM_GROUPS, type ParameterDefinition, type ParamValues } from "../../algorithms/types";
import { PAPER_NAMES, type PaperName, sheetFor } from "../../core/paper";
import { penWarning } from "../../export/validate";
import { MAX_SEED, currentParams, useSettings } from "../../store/settings";
import { ColorControl, IconButton, Notice, NumberControl, Section, SelectControl, ToggleControl } from "./ui";

function SeedControls() {
  const state = useSettings(), { seed, seedLocked, seedHistory, setSeed, randomSeed, nextVariation, previousSeed, setSeedLocked } = state;
  const algo = getAlgorithm(state.algorithmId)!, usesSeed = algo.usesSeed ? algo.usesSeed(currentParams(state)) : true;
  return (
    <div className="grid gap-2">
      <div className="flex items-center gap-1.5">
        <label htmlFor="seed" className="flex-1 text-muted">Seed</label>
        <input id="seed" type="number" min={1} max={MAX_SEED} value={seed} disabled={seedLocked}
          onChange={(e) => setSeed(Number(e.target.value))}
          className="w-24 rounded border border-line bg-bg px-1.5 py-0.5 text-right font-mono text-[12px] tabular-nums disabled:opacity-50" />
        <IconButton label={seedLocked ? "Unlock seed" : "Lock seed"} active={seedLocked} onClick={() => setSeedLocked(!seedLocked)}>
          {seedLocked ? <Lock size={13} /> : <LockOpen size={13} />}
        </IconButton>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        <IconButton label="Random seed" onClick={randomSeed} disabled={seedLocked}><Shuffle size={13} /><span className="text-[12px]">Random</span></IconButton>
        <IconButton label="Next variation (seed + 1)" onClick={nextVariation} disabled={seedLocked}><SkipForward size={13} /><span className="text-[12px]">Next</span></IconButton>
        <IconButton label="Restore previous seed" onClick={previousSeed} disabled={seedLocked || !seedHistory.length}><Undo2 size={13} /><span className="text-[12px]">Back</span></IconButton>
      </div>
      {!usesSeed && <p className="text-[11.5px] leading-snug text-faint" data-testid="seed-unused">
        With these settings {algo.name} is exact maths, so the seed has no effect. Turn up Wobble, Noise or Detune to use it.
      </p>}
    </div>
  );
}

function PaperControls() {
  const { paper, setPaper, profile, setProfile } = useSettings();
  const sheet = sheetFor(paper);
  return (
    <>
      <SelectControl id="paper" label="Paper" value={paper.paper} onChange={(v) => setPaper({ paper: v as PaperName })}
        options={PAPER_NAMES.map((n) => ({ value: n, label: n === "Custom" ? "Custom" : n === "Square" ? "Square 200 × 200" : n }))} />
      {paper.paper === "Custom" && <>
        <NumberControl id="customWidth" label="Width" value={paper.customWidth} min={50} max={1200} step={1} unit="mm" onChange={(v) => setPaper({ customWidth: v })} />
        <NumberControl id="customHeight" label="Height" value={paper.customHeight} min={50} max={1200} step={1} unit="mm" onChange={(v) => setPaper({ customHeight: v })} />
      </>}
      <SelectControl id="orientation" label="Orientation" value={paper.orientation} onChange={(v) => setPaper({ orientation: v as "portrait" | "landscape" })}
        options={[{ value: "portrait", label: "Portrait" }, { value: "landscape", label: "Landscape" }]} />
      <NumberControl id="margin" label="Margin" value={paper.margin} min={0} max={80} step={1} unit="mm" defaultValue={20}
        onChange={(v) => setPaper({ margin: v })} onReset={() => setPaper({ margin: 20 })} />
      <p className="font-mono text-[11px] text-faint">Paper size {sheet.width} × {sheet.height} mm · drawing area {sheet.area.width} × {sheet.area.height} mm</p>
      <div className="mt-1 border-t border-line pt-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-faint">Plotter · {profile.name}</div>
      <NumberControl id="maxWidth" label="Drawing area width" description="Your machine's usable width. 0 = not set." value={profile.maxWidth} min={0} max={1500} step={1} unit="mm" onChange={(v) => setProfile({ maxWidth: v })} />
      <NumberControl id="maxHeight" label="Drawing area height" description="Your machine's usable height. 0 = not set." value={profile.maxHeight} min={0} max={1500} step={1} unit="mm" onChange={(v) => setProfile({ maxHeight: v })} />
      <NumberControl id="penDownSpeed" label="Pen-down speed" description="Used for the time estimate." value={profile.penDownSpeed} min={1} max={300} step={1} unit="mm/s" onChange={(v) => setProfile({ penDownSpeed: v })} />
      <NumberControl id="penUpSpeed" label="Pen-up speed" description="Used for the time estimate." value={profile.penUpSpeed} min={1} max={500} step={1} unit="mm/s" onChange={(v) => setProfile({ penUpSpeed: v })} />
      <NumberControl id="penLiftDelay" label="Pen-lift delay" description="Time per pen lift and drop." value={profile.penLiftDelay} min={0} max={3} step={0.05} unit="s" onChange={(v) => setProfile({ penLiftDelay: v })} />
      <p className="text-[11px] leading-snug text-faint">These are starting values, not the machine's specs. Measure your plotter and enter its real numbers.</p>
    </>
  );
}

function StrokeControls() {
  const { penWidth, strokeColor, paperColor, setStroke } = useSettings();
  return (
    <>
      <NumberControl id="penWidth" label="Pen width" description="Preview strokes and SVG stroke width, in mm." value={penWidth} min={0.05} max={2} step={0.05} unit="mm"
        defaultValue={0.3} onChange={(v) => setStroke({ penWidth: v })} onReset={() => setStroke({ penWidth: 0.3 })} />
      <ColorControl id="strokeColor" label="Stroke colour" value={strokeColor} onChange={(v) => setStroke({ strokeColor: v })} />
      <ColorControl id="paperColor" label="Paper colour (preview only)" value={paperColor} onChange={(v) => setStroke({ paperColor: v })} />
    </>
  );
}

function OptimizeControls() {
  const { optimize, setOptimize } = useSettings();
  return (
    <>
      <div className="mt-1 border-t border-line pt-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-faint">Plotter optimisation</div>
      <ToggleControl id="order" label="Reorder paths" description="Nearest-neighbour ordering with reversal, to cut pen-up travel." value={optimize.order} onChange={(v) => setOptimize({ order: v })} />
      <NumberControl id="simplify" label="Simplify tolerance" description="Ramer–Douglas–Peucker. Points never move further than this. 0 = off." value={optimize.simplify} min={0} max={0.5} step={0.01} unit="mm" onChange={(v) => setOptimize({ simplify: v })} />
      <NumberControl id="minPathLength" label="Remove paths under" description="Paths shorter than this are dropped. Zero-length paths are always dropped." value={optimize.minPathLength} min={0} max={10} step={0.1} unit="mm" onChange={(v) => setOptimize({ minPathLength: v })} />
    </>
  );
}

function ParamControl({ def, values }: { def: ParameterDefinition; values: ParamValues }) {
  const setParam = useSettings((s) => s.setParam), resetParam = useSettings((s) => s.resetParam);
  const v = values[def.id];
  if (def.type === "number")
    return <NumberControl id={def.id} label={def.label} description={def.description} value={v as number} min={def.min} max={def.max} step={def.step}
      unit={def.unit} defaultValue={def.default} onChange={(x) => setParam(def.id, x)} onReset={() => resetParam(def.id)} />;
  if (def.type === "boolean") return <ToggleControl id={def.id} label={def.label} description={def.description} value={v as boolean} onChange={(x) => setParam(def.id, x)} />;
  return <SelectControl id={def.id} label={def.label} description={def.description} value={v as string} options={def.options} onChange={(x) => setParam(def.id, x)} />;
}

export function ParamPanel() {
  const state = useSettings();
  const algo = getAlgorithm(state.algorithmId)!, values = currentParams(state);
  const spacingDef = algo.parameters.find((p) => p.type === "number" && p.role === "minSpacing");
  const spacingIssue = spacingDef ? penWarning(values[spacingDef.id] as number, state.penWidth) : null;
  return (
    <aside aria-label="Parameters" className="min-h-0 overflow-y-auto border-l border-line bg-panel">
      <Section title="Seed"><SeedControls /></Section>
      <Section title="Paper & plotter" defaultOpen={false}><PaperControls /></Section>
      {PARAM_GROUPS.map((group) => {
        const defs = algo.parameters.filter((p) => p.group === group && (!p.visibleWhen || p.visibleWhen(values)));
        const extra = group === "Stroke" ? <StrokeControls /> : group === "Advanced" ? <OptimizeControls /> : null;
        if (!defs.length && !extra) return null;
        return (
          <Section key={group} title={group} defaultOpen={group !== "Advanced"}>
            {(group === "Density" || group === "Stroke") && spacingIssue && <Notice level="warning">{spacingIssue.message}</Notice>}
            {defs.map((d) => <ParamControl key={d.id} def={d} values={values} />)}
            {extra}
          </Section>
        );
      })}
      <div className="p-3">
        <button type="button" onClick={state.resetParams}
          className="flex w-full items-center justify-center gap-1.5 rounded-md border border-line bg-raised py-1.5 text-muted hover:text-fg">
          <RotateCcw size={13} /> Reset {algo.name} parameters
        </button>
      </div>
    </aside>
  );
}
