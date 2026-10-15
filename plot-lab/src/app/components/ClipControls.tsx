import { sheetFor } from "../../core/paper";
import { useSettings } from "../../store/settings";
import { NumberControl, SelectControl, ToggleControl } from "./ui";

export function ClipControls() {
  const clip = useSettings((s) => s.clip), setClip = useSettings((s) => s.setClip), paper = useSettings((s) => s.paper);
  const a = sheetFor(paper).area, big = Math.ceil(Math.max(a.width, a.height) * 1.5);
  return (
    <>
      <div className="mt-1 border-t border-line pt-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-faint">Clip to shape</div>
      <ToggleControl id="clipEnabled" label="Clip to shape" description="Cut every path exactly at the shape's edge and remove the pieces on the other side." value={clip.enabled} onChange={(v) => setClip({ enabled: v })} />
      {clip.enabled && <>
        <SelectControl id="clipShape" label="Shape" value={clip.shape} onChange={(v) => setClip({ shape: v as typeof clip.shape })}
          options={[{ value: "circle", label: "Circle" }, { value: "ellipse", label: "Ellipse" }, { value: "rectangle", label: "Rectangle" }]} />
        <SelectControl id="clipKeep" label="Keep" value={clip.keep} onChange={(v) => setClip({ keep: v as typeof clip.keep })}
          options={[{ value: "inside", label: "Inside" }, { value: "outside", label: "Outside" }]} />
        <NumberControl id="clipWidth" label={clip.shape === "circle" ? "Diameter" : "Width"} value={clip.width} min={2} max={big} step={0.5} unit="mm" onChange={(v) => setClip({ width: v })} />
        {clip.shape !== "circle" && <NumberControl id="clipHeight" label="Height" value={clip.height} min={2} max={big} step={0.5} unit="mm" onChange={(v) => setClip({ height: v })} />}
        <NumberControl id="clipX" label="Position X" description="From the centre of the drawing area." value={clip.offsetX} min={-Math.ceil(a.width)} max={Math.ceil(a.width)} step={0.5} unit="mm" onChange={(v) => setClip({ offsetX: v })} />
        <NumberControl id="clipY" label="Position Y" description="From the centre of the drawing area." value={clip.offsetY} min={-Math.ceil(a.height)} max={Math.ceil(a.height)} step={0.5} unit="mm" onChange={(v) => setClip({ offsetY: v })} />
        <ToggleControl id="clipOutline" label="Draw outline (own layer)" value={clip.outline} onChange={(v) => setClip({ outline: v })} />
      </>}
    </>
  );
}
