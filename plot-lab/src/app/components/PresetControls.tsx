import { Bookmark, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { getAlgorithm } from "../../algorithms/registry";
import { useLibrary } from "../../store/library";
import { currentParams, useSettings } from "../../store/settings";

export function PresetControls() {
  const algorithmId = useSettings((s) => s.algorithmId), all = useLibrary((s) => s.presets);
  const presets = useMemo(() => all.filter((p) => p.algorithmId === algorithmId), [all, algorithmId]);
  const addPreset = useLibrary((s) => s.addPreset), removePreset = useLibrary((s) => s.removePreset);
  const [selected, setSelected] = useState(""), [name, setName] = useState("");
  const chosen = presets.find((p) => p.id === selected);
  const apply = () => {
    if (!chosen) return;
    const s = useSettings.getState();
    s.setParams(chosen.algorithmId, chosen.params);
    s.setSeed(chosen.seed);
  };
  const save = () => {
    const s = useSettings.getState(), n = name.trim() || `${getAlgorithm(algorithmId)?.name} ${presets.length + 1}`;
    const p = addPreset({ name: n, algorithmId, params: currentParams(s), seed: s.seed });
    setSelected(p.id);
    setName("");
  };
  const btn = "rounded border border-line bg-raised px-2 py-1 text-[12px] text-muted hover:text-fg disabled:opacity-40";
  return (
    <div className="grid gap-2" data-testid="presets">
      <div className="flex gap-1.5">
        <select aria-label="Preset" value={selected} onChange={(e) => setSelected(e.target.value)} className="min-w-0 flex-1 rounded border border-line bg-bg px-1.5 py-1 text-fg">
          <option value="">{presets.length ? "Choose a preset…" : "No presets yet"}</option>
          {presets.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <button type="button" className={btn} disabled={!chosen} onClick={apply}>Apply</button>
        <button type="button" className={btn} disabled={!chosen} aria-label="Delete preset" onClick={() => { if (chosen) { removePreset(chosen.id); setSelected(""); } }}><Trash2 size={13} /></button>
      </div>
      <div className="flex gap-1.5">
        <input aria-label="New preset name" placeholder="Preset name" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()}
          className="min-w-0 flex-1 rounded border border-line bg-bg px-1.5 py-1 text-fg" />
        <button type="button" className={`${btn} flex items-center gap-1`} onClick={save}><Bookmark size={13} /> Save preset</button>
      </div>
      <p className="text-[11px] leading-snug text-faint">Presets keep this algorithm's parameters and seed in this browser.</p>
    </div>
  );
}
