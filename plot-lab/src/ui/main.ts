import { type FlowFieldParams, layoutFor, penWarning } from "../algorithms/flowField";
import type { DirectionField, ScalarField } from "../core/fields";
import type { Path } from "../core/path";
import type { PlotStats } from "../engine/order";
import { type View, drawDirection, drawScalar, strokePaths } from "../render/canvas";
import { toSvg } from "../render/svg";
import type { RunMessage, WorkerMessage } from "../worker/protocol";
import FlowWorker from "../worker/flowField.worker.ts?worker";
import { CONTROLS, DEFAULTS, DRAW_ONLY } from "./controls";

const STORE = "plot-lab/flow-field";
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

let P: FlowFieldParams = { ...DEFAULTS };
try {
  const saved = JSON.parse(localStorage.getItem(STORE) ?? "null");
  if (saved) for (const k in saved) if (k in DEFAULTS) (P as unknown as Record<string, unknown>)[k] = saved[k];
} catch { /* storage unavailable */ }

// ---------- controls
const fmt = (step: number, v: number, unit?: string) =>
  v.toFixed(step >= 1 ? 0 : step >= 0.1 ? 1 : step >= 0.01 ? 2 : 3) + (unit ? " " + unit : "");
const rows: { el: HTMLElement; show?: (p: FlowFieldParams) => boolean; sync: () => void }[] = [];

for (const g of CONTROLS) {
  const d = document.createElement("details");
  d.open = !!g.open;
  d.innerHTML = `<summary>${g.group}</summary><div class="group"></div>`;
  const box = d.querySelector(".group")!;
  for (const c of g.items) {
    const w = document.createElement("div"), id = "c_" + c.id, key = c.id as string;
    const P_ = () => P as unknown as Record<string, unknown>;
    const tip = c.tip ? ` title="${c.tip}"` : "";
    let sync: () => void;
    if ("type" in c && c.type === "check") {
      w.className = "check";
      w.innerHTML = `<input type="checkbox" id="${id}"><label for="${id}"${tip}>${c.label}</label>`;
      const el = w.querySelector("input")!;
      sync = () => { el.checked = !!P_()[key]; };
      el.addEventListener("input", () => { P_()[key] = el.checked; changed(key); });
    } else if ("type" in c && c.type === "select") {
      w.className = "ctl";
      w.innerHTML = `<label for="${id}"${tip}>${c.label}</label><select id="${id}">${c.options.map(([v, t]) => `<option value="${v}">${t}</option>`).join("")}</select>`;
      const el = w.querySelector("select")!;
      sync = () => { el.value = String(P_()[key]); };
      el.addEventListener("input", () => { P_()[key] = el.value; changed(key); });
    } else {
      const r = c as Extract<typeof c, { min: number }>;
      w.className = "ctl";
      w.innerHTML = `<label for="${id}"${tip}>${r.label}</label><output></output><input type="range" id="${id}" min="${r.min}" max="${r.max}" step="${r.step}">`;
      const el = w.querySelector("input")!, out = w.querySelector("output")!;
      sync = () => { el.value = String(P_()[key]); out.textContent = fmt(r.step, +el.value, r.unit); };
      el.addEventListener("input", () => { P_()[key] = +el.value; out.textContent = fmt(r.step, +el.value, r.unit); changed(key); });
    }
    w.querySelector("label")!.addEventListener("dblclick", () => { P_()[key] = DEFAULTS[c.id]; syncUI(); changed(key); });
    box.appendChild(w);
    rows.push({ el: w, show: "show" in c ? c.show : undefined, sync });
  }
  $("controls").appendChild(d);
}

function syncUI() {
  for (const r of rows) { r.sync(); r.el.hidden = r.show ? !r.show(P) : false; }
  const warn = penWarning(P), el = $("warning");
  el.hidden = !warn;
  el.textContent = warn ?? "";
}

let regen = 0;
function changed(key?: string) {
  try { localStorage.setItem(STORE, JSON.stringify(P)); } catch { /* ignore */ }
  syncUI();
  if (key && DRAW_ONLY.has(key as keyof FlowFieldParams)) { draw(); stats(); return; }
  if ($<HTMLInputElement>("auto").checked) { clearTimeout(regen); regen = window.setTimeout(generate, 350); }
  else setStatus("Settings changed — press Generate");
}

// ---------- generation
let worker: Worker | null = null, job = 0;
let lines: Path[] = [], final: Path[] | null = null, result: { before: PlotStats; after: PlotStats; ms: number } | null = null;
let fields: { tone: ScalarField; direction: DirectionField; mmPerPx: number; ox: number; oy: number } | null = null;

function generate() {
  worker?.terminate();
  worker = new FlowWorker();
  const my = ++job;
  lines = []; final = null; result = null;
  draw(); stats();
  setStatus("Building field…");
  worker.onmessage = (e: MessageEvent<WorkerMessage>) => {
    const m = e.data;
    if (m.job !== my) return;
    if (m.type === "fields") {
      fields = {
        tone: { width: m.width, height: m.height, data: m.tone },
        direction: { width: m.width, height: m.height, c: m.c, s: m.s },
        mmPerPx: m.mmPerPx, ox: m.ox, oy: m.oy,
      };
      if (view !== "lines") draw();
      setStatus("Tracing lines…");
    } else if (m.type === "batch") {
      lines.push(...m.paths);
      if (view === "lines" && current) strokePaths(ctx, m.paths, current, P.penWidth, ink);
      $("bar").style.width = (m.progress * 100).toFixed(1) + "%";
      setStatus(`Tracing… ${lines.length.toLocaleString()} lines`);
    } else if (m.type === "done") {
      final = lines = m.paths;
      result = m;
      $("bar").style.width = "0";
      draw(); stats();
      setStatus(`Done in ${(m.ms / 1000).toFixed(1)} s`);
    } else {
      setStatus("Error: " + m.message);
    }
  };
  worker.onerror = () => setStatus("Something went wrong while tracing. Try a lower grid resolution.");
  worker.postMessage({ job: my, params: { ...P } } satisfies RunMessage);
}
$("go").onclick = generate;

// ---------- preview
const cv = $<HTMLCanvasElement>("sheet"), ctx = cv.getContext("2d")!;
let view: "lines" | "tone" | "field" = "lines", current: View | null = null;
const ink = "#15171b";
document.querySelectorAll<HTMLButtonElement>(".viewseg button").forEach((b) => (b.onclick = () => {
  view = b.dataset.view as typeof view;
  document.querySelectorAll(".viewseg button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
  draw();
}));

function draw() {
  const { sheet } = layoutFor(P), wrap = $("wrap");
  const s = Math.max(0.5, Math.min((wrap.clientWidth - 36) / sheet.width, (wrap.clientHeight - 36) / sheet.height));
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  cv.style.width = Math.floor(sheet.width * s) + "px";
  cv.style.height = Math.floor(sheet.height * s) + "px";
  cv.width = Math.floor(sheet.width * s * dpr);
  cv.height = Math.floor(sheet.height * s * dpr);
  current = { pxPerMm: s * dpr };
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, cv.width, cv.height);
  if (view === "tone" && fields) { drawScalar(ctx, fields.tone, current, fields.ox, fields.oy, fields.mmPerPx); return; }
  if (view === "field" && fields) {
    drawScalar(ctx, fields.tone, current, fields.ox, fields.oy, fields.mmPerPx, (t) => 225 + t * 30);
    drawDirection(ctx, fields.direction, current, fields.ox, fields.oy, fields.mmPerPx, "#2c43c4");
    return;
  }
  strokePaths(ctx, lines, current, P.penWidth, ink);
}
new ResizeObserver(() => draw()).observe($("wrap"));

// ---------- stats (SPEC_ADDENDUM §H: before and after optimisation)
const m = (mm: number) => (mm / 1000).toFixed(1) + " m";
const mins = (s: number) => { const h = Math.floor(s / 3600), mi = Math.round((s % 3600) / 60); return (h ? h + " h " : "") + mi + " min"; };
const retime = (s: PlotStats) => s.ink / P.drawSpeed + s.travel / P.travelSpeed + s.paths * P.penLift;
function stats() {
  const { sheet, grid } = layoutFor(P), el = $("stats");
  const base = `<span>Sheet <b>${sheet.width} × ${sheet.height} mm</b></span><span>Grid <b>${grid.width} × ${grid.height}</b></span>`;
  if (!result) { el.innerHTML = base; return; }
  const { before: b, after: a } = result;
  el.innerHTML = `<span>Paths <b>${a.paths.toLocaleString()}</b></span><span>Ink <b>${m(a.ink)}</b></span>` +
    `<span>Pen-up <b>${m(b.travel)} → ${m(a.travel)}</b></span><span>Time <b>${mins(retime(b))} → ${mins(retime(a))}</b></span>` + base;
}

// ---------- export
function svgText(): string {
  const { sheet } = layoutFor(P);
  return toSvg({ width: sheet.width, height: sheet.height, penWidth: P.penWidth, layers: [{ label: "ink", paths: final!, stroke: ink }], comment: "Plot Lab · flow field · " + JSON.stringify(P) });
}
$("exportSvg").onclick = () => {
  if (!final) { setStatus("Wait until tracing is done"); return; }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([svgText()], { type: "image/svg+xml" }));
  a.download = `flow-field_${P.paper}_seed${P.seed}.svg`;
  a.click();
  URL.revokeObjectURL(a.href);
};
$("copySvg").onclick = () => {
  if (!final) { setStatus("Wait until tracing is done"); return; }
  navigator.clipboard.writeText(svgText()).then(() => setStatus("SVG copied"), () => setStatus("Clipboard blocked"));
};
$("resetAll").onclick = () => { P = { ...DEFAULTS }; changed(); };

function setStatus(t: string) { $("status").textContent = t; }

syncUI();
draw();
stats();
generate();
