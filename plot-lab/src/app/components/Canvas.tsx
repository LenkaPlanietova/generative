import { Expand, Frame, Grid3x3, Image as ImageIcon, Minus, Plus, Route, Scan, Shrink } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { sheetFor } from "../../core/paper";
import { drawPathOrder, pathsToPath2D } from "../../render/preview";
import { useGeneration } from "../../store/generation";
import { getAlgorithm } from "../../algorithms/registry";
import { adjustFrom } from "../../image/params";
import { sampleImages } from "../../image/sample";
import { sampleImage } from "../../image/sampler";
import { useImages } from "../../store/images";
import { resolveParams } from "../../algorithms/types";
import { useSettings } from "../../store/settings";
import { IconButton } from "./ui";

/** Camera: CSS px per mm, and the sheet origin's position in CSS px. */
interface Cam { zoom: number; x: number; y: number }
const CSS_PX_PER_MM = 96 / 25.4;

export function Canvas() {
  const wrap = useRef<HTMLDivElement>(null), cv = useRef<HTMLCanvasElement>(null);
  const paper = useSettings((s) => s.paper), view = useSettings((s) => s.view), setView = useSettings((s) => s.setView);
  const penWidth = useSettings((s) => s.penWidth), strokeColor = useSettings((s) => s.strokeColor), paperColor = useSettings((s) => s.paperColor);
  const geometry = useGeneration((s) => s.geometry), partial = useGeneration((s) => s.partial), status = useGeneration((s) => s.status);
  const sheet = useMemo(() => sheetFor(paper), [paper]);
  const algo = getAlgorithm(useSettings((s) => s.algorithmId))!;
  const rawParams = useSettings((s) => s.params[s.algorithmId]), photo = useImages((s) => s.photo);
  const params = useMemo(() => resolveParams(algo, rawParams ?? {}), [algo, rawParams]);
  const adjustKey = algo.inputs ? JSON.stringify(adjustFrom(params)) : "";
  // The reference image exactly as the algorithm samples it (placement and tone adjustments), for the overlay.
  const reference = useMemo(() => {
    if (!algo.inputs || !view.reference) return null;
    const img = photo ?? sampleImages().photo, a = sheet.area, cell = Math.max(a.width, a.height) / 600;
    const W = Math.ceil(a.width / cell), H = Math.ceil(a.height / cell);
    const data = sampleImage(img, a, { W, H, x0: a.x, y0: a.y, sx: cell, sy: cell }, JSON.parse(adjustKey), 1);
    const id = new ImageData(W, H);
    for (let i = 0; i < data.length; i++) { const v = data[i] * 255; id.data[i * 4] = id.data[i * 4 + 1] = id.data[i * 4 + 2] = v; id.data[i * 4 + 3] = 255; }
    const oc = new OffscreenCanvas(W, H);
    oc.getContext("2d")!.putImageData(id, 0, 0);
    return { canvas: oc, x: a.x, y: a.y, w: W * cell, h: H * cell };
  }, [algo.inputs, view.reference, photo, sheet, adjustKey]);

  const [size, setSize] = useState({ w: 0, h: 0 });
  const [cam, setCam] = useState<Cam | null>(null);
  const [fitted, setFitted] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);

  const fitCam = useCallback((w: number, h: number): Cam => {
    // Leave room for the toolbar floating over the top edge.
    const top = 60, pad = 24, zoom = Math.max(0.05, Math.min((w - 2 * pad) / sheet.width, (h - top - pad) / sheet.height));
    return { zoom, x: (w - sheet.width * zoom) / 2, y: top + (h - top - pad - sheet.height * zoom) / 2 };
  }, [sheet.width, sheet.height]);
  const fit = useCallback(() => { setCam(fitCam(size.w, size.h)); setFitted(true); }, [fitCam, size]);

  useEffect(() => {
    const el = wrap.current!;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    const fs = () => setFullscreen(document.fullscreenElement === el);
    document.addEventListener("fullscreenchange", fs);
    return () => { ro.disconnect(); document.removeEventListener("fullscreenchange", fs); };
  }, []);
  // Keep fitting on resize and paper change until the user zooms or pans.
  useEffect(() => { if (size.w && (fitted || !cam)) setCam(fitCam(size.w, size.h)); }, [size, fitCam]);
  useEffect(() => { if (size.w) fit(); }, [sheet.width, sheet.height]);

  const showing = status === "generating" && partial.length ? partial : geometry?.paths ?? [];
  const path2d = useMemo(() => pathsToPath2D(showing), [showing]);

  useEffect(() => {
    const c = cv.current;
    if (!c || !cam || !size.w) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    c.width = Math.round(size.w * dpr);
    c.height = Math.round(size.h * dpr);
    const ctx = c.getContext("2d")!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#0b0c0e";
    ctx.fillRect(0, 0, c.width, c.height);
    const k = cam.zoom * dpr, px = 1 / k; // px = mm per device pixel
    ctx.setTransform(k, 0, 0, k, cam.x * dpr, cam.y * dpr);
    // Paper
    ctx.shadowColor = "rgba(0,0,0,0.55)";
    ctx.shadowBlur = 24 * dpr;
    ctx.fillStyle = paperColor;
    ctx.fillRect(0, 0, sheet.width, sheet.height);
    ctx.shadowColor = "transparent";
    if (view.grid) {
      ctx.strokeStyle = "rgba(60,110,200,0.18)";
      ctx.lineWidth = px;
      ctx.beginPath();
      for (let x = 10; x < sheet.width; x += 10) { ctx.moveTo(x, 0); ctx.lineTo(x, sheet.height); }
      for (let y = 10; y < sheet.height; y += 10) { ctx.moveTo(0, y); ctx.lineTo(sheet.width, y); }
      ctx.stroke();
    }
    if (view.margins) {
      const a = sheet.area;
      ctx.strokeStyle = "rgba(227,168,87,0.7)";
      ctx.lineWidth = px;
      ctx.setLineDash([px * 5, px * 4]);
      ctx.strokeRect(a.x, a.y, a.width, a.height);
      ctx.setLineDash([]);
    }
    if (reference) {
      ctx.globalAlpha = 0.35;
      ctx.drawImage(reference.canvas, reference.x, reference.y, reference.w, reference.h);
      ctx.globalAlpha = 1;
    }
    // Artwork at the real pen width (in mm), so density on screen matches the plot.
    if (view.pathViz && status !== "generating") drawPathOrder(ctx, showing, penWidth, px);
    else {
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = penWidth;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.stroke(path2d);
    }
  }, [cam, size, sheet, view, penWidth, strokeColor, paperColor, path2d, showing, status, reference]);

  // Wheel zoom around the cursor, drag to pan, double-click to fit.
  useEffect(() => {
    const c = cv.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setCam((cur) => {
        if (!cur) return cur;
        const r = c.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
        const zoom = Math.min(200, Math.max(0.05, cur.zoom * Math.exp(-e.deltaY * 0.0015)));
        const f = zoom / cur.zoom;
        return { zoom, x: mx - (mx - cur.x) * f, y: my - (my - cur.y) * f };
      });
      setFitted(false);
    };
    c.addEventListener("wheel", onWheel, { passive: false });
    return () => c.removeEventListener("wheel", onWheel);
  }, []);
  const drag = useRef<{ x: number; y: number } | null>(null);

  const zoomBy = (f: number) => {
    setCam((cur) => cur && { zoom: cur.zoom * f, x: size.w / 2 - (size.w / 2 - cur.x) * f, y: size.h / 2 - (size.h / 2 - cur.y) * f });
    setFitted(false);
  };
  // Keyboard: + / − to zoom, 0 to fit (ignored while typing in a field).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.metaKey || e.ctrlKey || e.altKey || /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName) || document.querySelector('[role="dialog"]')) return;
      if (e.key === "+" || e.key === "=") zoomBy(1.25);
      else if (e.key === "-" || e.key === "_") zoomBy(1 / 1.25);
      else if (e.key === "0") fit();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  const actualSize = () => {
    const zoom = CSS_PX_PER_MM;
    setCam({ zoom, x: (size.w - sheet.width * zoom) / 2, y: (size.h - sheet.height * zoom) / 2 });
    setFitted(false);
  };

  return (
    <div ref={wrap} className="relative min-h-0 min-w-0 overflow-hidden bg-[#0b0c0e]" data-testid="artwork">
      <canvas ref={cv} aria-label="Artwork preview" style={{ width: size.w, height: size.h }}
        className={drag.current ? "cursor-grabbing" : "cursor-grab"}
        onPointerDown={(e) => { drag.current = { x: e.clientX, y: e.clientY }; (e.target as Element).setPointerCapture(e.pointerId); }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          const dx = e.clientX - drag.current.x, dy = e.clientY - drag.current.y;
          drag.current = { x: e.clientX, y: e.clientY };
          setCam((cur) => cur && { ...cur, x: cur.x + dx, y: cur.y + dy });
          setFitted(false);
        }}
        onPointerUp={() => { drag.current = null; }}
        onDoubleClick={fit} />
      <p className="pointer-events-none absolute bottom-2 left-3 text-[11px] text-faint">
        Zoom: − / + buttons, + / − keys or scroll · Drag to move · Double-click or 0 to fit
      </p>
      <div className="absolute top-3 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-lg border border-line bg-panel/90 p-1 shadow-lg backdrop-blur">
        <IconButton label="Zoom out (−)" onClick={() => zoomBy(1 / 1.25)}><Minus size={15} /></IconButton>
        <span className="w-12 text-center font-mono text-[11px] text-muted tabular-nums" title="Zoom (100 % = actual physical size on a 96 dpi screen)">
          {cam ? Math.round((cam.zoom / CSS_PX_PER_MM) * 100) : 0}%
        </span>
        <IconButton label="Zoom in (+)" onClick={() => zoomBy(1.25)}><Plus size={15} /></IconButton>
        <IconButton label="Fit to screen (0)" onClick={fit}><Scan size={14} /></IconButton>
        <IconButton label="Actual size" onClick={actualSize}><span className="font-mono text-[10px]">1:1</span></IconButton>
        <span className="mx-1 h-4 w-px bg-line" />
        <IconButton label="Margins" active={view.margins} onClick={() => setView({ margins: !view.margins })}><Frame size={14} /></IconButton>
        <IconButton label="Grid (10 mm)" active={view.grid} onClick={() => setView({ grid: !view.grid })}><Grid3x3 size={14} /></IconButton>
        {algo.inputs && <IconButton label="Show reference image" active={view.reference} onClick={() => setView({ reference: !view.reference })}><ImageIcon size={14} /></IconButton>}
        <IconButton label="Path order and pen-up moves" active={view.pathViz} onClick={() => setView({ pathViz: !view.pathViz })}><Route size={14} /></IconButton>
        <span className="mx-1 h-4 w-px bg-line" />
        <IconButton label={fullscreen ? "Exit full screen" : "Full screen"}
          onClick={() => (fullscreen ? document.exitFullscreen() : wrap.current?.requestFullscreen())}>
          {fullscreen ? <Shrink size={14} /> : <Expand size={14} />}
        </IconButton>
      </div>
    </div>
  );
}
