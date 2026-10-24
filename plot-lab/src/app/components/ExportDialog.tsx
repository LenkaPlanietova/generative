import { CircleAlert, CircleCheck, Copy, Download, FileArchive, FileText, TriangleAlert, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { getAlgorithm } from "../../algorithms/registry";
import { sheetFor } from "../../core/paper";
import { type Issue, penWarning, plotWarnings, validateGeometry, validateSvgText } from "../../export/validate";
import { inkedLayers, maskGuide, toSvg } from "../../export/svg";
import { plotInstructions, plotLayersMeta } from "../../plotter/plotLayers";
import { zip } from "../../export/zip";
import { plotStats } from "../../plotter/stats";
import { geometryKey, requestFromSettings, useGeneration } from "../../store/generation";
import { currentParams, useSettings } from "../../store/settings";
import { count, duration, metres } from "../format";

export function ExportDialog({ onClose }: { onClose: () => void }) {
  const settings = useSettings();
  const { geometry, request, status, plotLayers: report } = useGeneration();
  const sheet = sheetFor(settings.paper), algo = getAlgorithm(settings.algorithmId)!;
  const stale = !request || request.quality === "draft" || geometryKey(request) !== geometryKey(requestFromSettings());
  const [notice, setNotice] = useState("");

  const { svg, issues, stats, layers, instructions } = useMemo(() => {
    if (!geometry) return { svg: "", issues: [{ level: "error", code: "EMPTY", message: "Nothing generated yet." } as Issue], stats: null, layers: [], instructions: "" };
    const exportSettings = { strokeWidth: settings.penWidth, stroke: settings.strokeColor };
    // Plot layers: the split settings (mask and seed included) go into the metadata, the mask onto a %mask layer.
    const pl = request?.plotLayers && report && geometry.layers.some((l) => l.id === report.layers[0]?.id) ? request.plotLayers : undefined;
    const meta = { algorithm: algo.id, seed: settings.seed, params: currentParams(settings), paper: settings.paper, ...(pl ? { plotLayers: plotLayersMeta(pl, settings.seed) } : {}) };
    const guides = pl ? [maskGuide(pl.mask)] : [];
    const svg = toSvg(geometry, exportSettings, `Plot Lab · ${JSON.stringify(meta)}`, undefined, guides);
    const inked = inkedLayers(geometry);
    // One file per layer, for pen changes: same page and coordinates as the full drawing, so the layers register.
    const layers = inked.length < 2 ? [] : inked.map((l) => {
      const n = geometry.layers.indexOf(l) + 1;
      const file = toSvg(geometry, exportSettings, `Plot Lab · layer ${n} of ${geometry.layers.length} · ${JSON.stringify(meta)}`, l.id);
      return {
        id: l.id, n, name: l.name, svg: file, ok: validateSvgText(file, sheet).length === 0,
        stats: plotStats({ ...geometry, paths: geometry.paths.filter((p) => p.layerId === l.id) }, settings.profile),
        filename: `plotlab_${algo.id}_${settings.paper.paper}_seed${settings.seed}_layer${n}-${l.name.replace(/[^\w-]+/g, "_")}.svg`,
      };
    });
    const stats = plotStats(geometry, settings.profile);
    const spacingDef = algo.parameters.find((p) => p.type === "number" && p.role === "minSpacing");
    const instructions = pl && report ? plotInstructions(report, pl, (id) => plotStats({ ...geometry, paths: geometry.paths.filter((p) => p.layerId === id) }, settings.profile).time) : "";
    const issues: Issue[] = [
      ...(report?.issues ?? []),
      ...validateGeometry(geometry, sheet, exportSettings),
      ...validateSvgText(svg, sheet),
      ...plotWarnings(geometry, stats, settings.penWidth, settings.profile, sheet),
    ];
    const pw = spacingDef && penWarning(currentParams(settings)[spacingDef.id] as number, settings.penWidth);
    if (pw) issues.push(pw);
    if (stale) issues.unshift({ level: "error", code: "STALE", message: status === "generating" || request?.quality === "draft" ? "Still generating the full-quality drawing — wait for it to finish." : "Settings changed since the last generation. Regenerate first." });
    return { svg, issues, stats, layers, instructions };
  }, [geometry, settings, sheet, algo, stale, status, request, report]);

  const errors = issues.filter((i) => i.level === "error"), warnings = issues.filter((i) => i.level === "warning");
  // The preview URL is created and revoked inside one effect, so it is valid for exactly as long as it is shown
  // (React StrictMode mounts effects twice in development; a URL made outside the effect would be revoked early).
  const [url, setUrl] = useState("");
  useEffect(() => {
    if (!svg) { setUrl(""); return; }
    const u = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [svg]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);

  const filename = `plotlab_${algo.id}_${settings.paper.paper}_seed${settings.seed}.svg`;
  const save = (blob: Blob, name: string) => {
    // A fresh URL for every download, released only after the browser has had time to start saving it.
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 60_000);
    setNotice(`Download started: ${name} — check your Downloads folder`);
  };
  const download = () => save(new Blob([svg], { type: "image/svg+xml" }), filename);
  const downloadLayers = () => {
    const files = layers.map((l) => ({ name: l.filename, data: l.svg }));
    if (instructions) files.push({ name: filename.replace(/\.svg$/, "_instructions.txt"), data: instructions });
    const data = zip(files);
    save(new Blob([data as BlobPart], { type: "application/zip" }), filename.replace(/\.svg$/, "_layers.zip"));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Export SVG" onClick={(e) => e.stopPropagation()}
        className="grid max-h-full w-full max-w-5xl grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-xl border border-line bg-panel shadow-2xl">
        <header className="flex items-center border-b border-line px-4 py-3">
          <h2 className="flex-1 text-[14px] font-semibold">Export SVG</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-muted hover:text-fg"><X size={16} /></button>
        </header>
        <div className="grid min-h-0 gap-4 overflow-y-auto p-4 md:grid-cols-[minmax(0,1fr)_340px]">
          <div className="flex min-h-[320px] items-center justify-center rounded-lg bg-[#0b0c0e] p-4">
            {url && <img src={url} alt="SVG export preview" data-testid="svg-preview" className="max-h-[60vh] max-w-full bg-white shadow-lg" />}
          </div>
          <div className="grid content-start gap-3">
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-[11.5px] tabular-nums">
              <span className="text-faint">Paper size</span><span>{sheet.width} × {sheet.height} mm</span>
              <span className="text-faint">viewBox</span><span>0 0 {sheet.width} {sheet.height}</span>
              <span className="text-faint">Stroke</span><span>{settings.penWidth} mm {settings.strokeColor}</span>
              {stats && <>
                <span className="text-faint">Paths</span><span>{count(stats.paths)}</span>
                <span className="text-faint">Points</span><span>{count(stats.points)}</span>
                <span className="text-faint">Ink</span><span>{metres(stats.penDown)}</span>
                <span className="text-faint">Pen-up</span><span>{metres(stats.penUp)}</span>
                <span className="text-faint">Est. time</span><span>{duration(stats.time)}</span>
              </>}
              <span className="text-faint">File</span><span>{(svg.length / 1024).toFixed(0)} KB</span>
            </div>
            <ul className="grid gap-1.5" data-testid="validation">
              {errors.length === 0 && <li className="flex items-start gap-2 text-ok"><CircleCheck size={14} className="mt-0.5 shrink-0" /> All export checks passed.</li>}
              {errors.map((i) => <li key={i.code} data-level="error" className="flex items-start gap-2 text-danger"><CircleAlert size={14} className="mt-0.5 shrink-0" /> {i.message}</li>)}
              {warnings.map((i) => <li key={i.code} data-level="warning" className="flex items-start gap-2 text-warn"><TriangleAlert size={14} className="mt-0.5 shrink-0" /> {i.message}</li>)}
            </ul>
            {layers.length > 0 && <div className="grid gap-1.5 rounded-md border border-line p-2.5" data-testid="layer-files">
              <div className="flex items-center">
                <span className="flex-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-faint">{instructions ? "One file per layer" : "One file per pen"}</span>
                <button type="button" disabled={errors.length > 0 || layers.some((l) => !l.ok)} onClick={downloadLayers} title="All layer files in one .zip — double-click it to unpack"
                  className="flex items-center gap-1 rounded border border-line bg-raised px-2 py-0.5 text-[11.5px] text-fg disabled:opacity-40"><FileArchive size={12} /> All (.zip)</button>
              </div>
              {layers.map((l) => (
                <div key={l.id} className="flex items-center gap-2 font-mono text-[11px] tabular-nums">
                  <span className="min-w-0 flex-1 truncate" title={l.filename}>{l.n} {l.name}</span>
                  <span className="text-faint">{metres(l.stats.penDown)} · {duration(l.stats.time)}</span>
                  <button type="button" disabled={errors.length > 0 || !l.ok} onClick={() => save(new Blob([l.svg], { type: "image/svg+xml" }), l.filename)}
                    aria-label={`Download layer ${l.n}`} title={`Download ${l.filename}`} className="text-muted hover:text-fg disabled:opacity-40"><Download size={13} /></button>
                </div>
              ))}
              <p className="text-[11px] leading-snug text-faint">Same page size and position as the full file, so each pen lines up. Don't move the paper between pens.</p>
            </div>}
            {instructions && <div className="grid gap-1.5 rounded-md border border-line p-2.5" data-testid="plot-instructions">
              <div className="flex items-center">
                <span className="flex-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-faint">Plotting instructions</span>
                <button type="button" onClick={() => navigator.clipboard.writeText(instructions).then(() => setNotice("Instructions copied"), () => setNotice("Clipboard blocked by the browser"))}
                  className="flex items-center gap-1 rounded border border-line bg-raised px-2 py-0.5 text-[11.5px] text-fg"><Copy size={12} /> Copy</button>
                <button type="button" onClick={() => save(new Blob([instructions], { type: "text/plain" }), filename.replace(/\.svg$/, "_instructions.txt"))} aria-label="Download instructions"
                  className="ml-1 flex items-center gap-1 rounded border border-line bg-raised px-2 py-0.5 text-[11.5px] text-fg"><FileText size={12} /> .txt</button>
              </div>
              <pre className="max-h-56 overflow-auto whitespace-pre-wrap font-mono text-[10.5px] leading-snug text-muted">{instructions}</pre>
            </div>}
            <details className="rounded-md border border-line">
              <summary className="cursor-pointer px-2.5 py-1.5 text-muted">SVG source</summary>
              <pre className="max-h-56 overflow-auto px-2.5 pb-2 font-mono text-[10.5px] leading-snug text-muted">
                {svg.split("\n").slice(0, 40).join("\n")}{svg.split("\n").length > 40 ? "\n…" : ""}
              </pre>
            </details>
          </div>
        </div>
        <footer className="flex items-center gap-2 border-t border-line px-4 py-3">
          <span className="flex-1 text-[12px] text-muted" role="status">{notice || filename}</span>
          <button type="button" disabled={!svg || errors.length > 0} title="Copies the SVG code to the clipboard, to paste straight into Inkscape (Edit → Paste) or a text editor. No file is saved."
            onClick={() => navigator.clipboard.writeText(svg).then(() => setNotice("SVG copied to the clipboard — paste it into Inkscape or a text editor"), () => setNotice("Clipboard blocked by the browser"))}
            className="flex items-center gap-1.5 rounded-md border border-line bg-raised px-3 py-1.5 text-fg disabled:opacity-40"><Copy size={14} /> Copy to clipboard</button>
          <button type="button" disabled={!svg || errors.length > 0} onClick={download} title="Saves an .svg file to your Downloads folder"
            className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 font-medium text-black disabled:opacity-40"><Download size={14} /> Download SVG</button>
        </footer>
      </div>
    </div>
  );
}
