import { getAlgorithm } from "../../algorithms/registry";
import { sheetFor } from "../../core/paper";
import { retime } from "../../plotter/stats";
import { useGeneration } from "../../store/generation";
import { useSettings } from "../../store/settings";
import { count, duration, metres } from "../format";

const Item = ({ label, children, testid }: { label: string; children: React.ReactNode; testid?: string }) => (
  <span className="whitespace-nowrap" data-testid={testid}><span className="text-faint">{label}</span> <span className="text-fg">{children}</span></span>
);

export function StatusBar() {
  const { algorithmId, paper, seed, profile } = useSettings();
  const { status, progress, before, after, ms, error, request, generatingQuality, cached } = useGeneration();
  const sheet = sheetFor(paper);
  const draft = request?.quality === "draft";
  const state = status === "generating"
    ? (generatingQuality === "draft" ? `Draft ${Math.round(progress * 100)} %` : `${draft ? "Refining" : "Generating"} ${Math.round(progress * 100)} %`)
    : status === "error" ? `Error: ${error}`
    : status === "done" ? (draft ? "Draft preview" : cached ? "Ready · from cache" : `Ready · ${(ms / 1000).toFixed(1)} s`) : "Idle";
  return (
    <footer className="flex items-center gap-x-5 overflow-x-auto border-t border-line bg-panel px-3 font-mono text-[11px] text-muted tabular-nums">
      <Item label="Algorithm">{getAlgorithm(algorithmId)?.name}</Item>
      <Item label="Paper" testid="stat-paper">{sheet.width} × {sheet.height} mm</Item>
      {after && before && <>
        <Item label="Paths" testid="stat-paths">{count(after.paths)}</Item>
        <Item label="Points" testid="stat-points">{count(after.points)}</Item>
        <Item label="Ink" testid="stat-ink">{metres(after.penDown)}</Item>
        <Item label="Pen-up" testid="stat-penup">{metres(before.penUp)} → {metres(after.penUp)}</Item>
        <Item label="Time" testid="stat-time">{duration(retime(before, profile))} → {duration(retime(after, profile))}</Item>
        <Item label="Lifts">{count(after.penLifts)}</Item>
      </>}
      <Item label="Seed" testid="stat-seed">{seed}</Item>
      <span className="ml-auto whitespace-nowrap" data-testid="gen-status">
        <span className={status === "error" ? "text-danger" : status === "generating" || draft ? "text-accent" : "text-ok"}>●</span> {state}
      </span>
    </footer>
  );
}
