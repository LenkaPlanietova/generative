import { ImageUp, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { GrayImage } from "../../image/types";
import { useImages } from "../../store/images";
import { Notice } from "./ui";

function GrayThumb({ img, size = 56 }: { img?: GrayImage; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext("2d")!;
    cv.width = cv.height = size * 2;
    ctx.fillStyle = "#1b1c20";
    ctx.fillRect(0, 0, cv.width, cv.height);
    if (!img) return;
    const k = Math.min(cv.width / img.width, cv.height / img.height), w = Math.max(1, Math.round(img.width * k)), h = Math.max(1, Math.round(img.height * k));
    const id = new ImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const v = img.data[Math.min(img.height - 1, Math.floor(y / k)) * img.width + Math.min(img.width - 1, Math.floor(x / k))] * 255, o = (y * w + x) * 4;
      id.data[o] = id.data[o + 1] = id.data[o + 2] = v;
      id.data[o + 3] = 255;
    }
    ctx.putImageData(id, (cv.width - w) / 2, (cv.height - h) / 2);
  }, [img, size]);
  return <canvas ref={ref} style={{ width: size, height: size }} className="shrink-0 rounded border border-line" aria-hidden />;
}

function Slot({ kind, label, hint }: { kind: "photo" | "depth"; label: string; hint: string }) {
  const img = useImages((s) => s[kind]), loading = useImages((s) => s.loading === kind), load = useImages((s) => s.load), clear = useImages((s) => s.clear);
  const [over, setOver] = useState(false), input = useRef<HTMLInputElement>(null);
  return (
    <div data-testid={`image-${kind}`}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files[0]; if (f) void load(kind, f); }}
      className={`flex gap-2.5 rounded-md border border-dashed p-2 ${over ? "border-accent bg-accent/5" : "border-line"}`}>
      <GrayThumb img={img} />
      <div className="min-w-0 flex-1">
        <div className="text-[12px] font-medium text-fg">{label}</div>
        <div className="truncate text-[11.5px] text-muted" title={img?.name}>{loading ? "Loading…" : img ? img.name : hint}</div>
        {img && <div className="font-mono text-[10.5px] text-faint">{img.width} × {img.height} · {img.bits}-bit</div>}
        <div className="mt-1 flex gap-1.5">
          <button type="button" onClick={() => input.current?.click()}
            className="flex items-center gap-1 rounded border border-line bg-raised px-2 py-0.5 text-[11.5px] text-muted hover:text-fg">
            <ImageUp size={12} /> {img ? "Replace" : "Load"}
          </button>
          {img && <button type="button" onClick={() => clear(kind)} aria-label={`Remove ${label}`}
            className="flex items-center gap-1 rounded border border-line bg-raised px-2 py-0.5 text-[11.5px] text-muted hover:text-fg"><X size={12} /> Remove</button>}
        </div>
        <input ref={input} type="file" accept="image/png,image/jpeg" hidden aria-label={`Load ${label}`}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void load(kind, f); e.target.value = ""; }} />
      </div>
    </div>
  );
}

export function ImageInputs({ inputs }: { inputs: { photo?: boolean; depth?: boolean } }) {
  const photo = useImages((s) => s.photo), error = useImages((s) => s.error);
  return (
    <div className="grid gap-2">
      {inputs.photo && <Slot kind="photo" label={inputs.depth ? "Photo" : "Image"} hint="Built-in sample head — drop a PNG or JPG here" />}
      {inputs.depth && <Slot kind="depth" label="Depth map (optional)" hint={photo ? "None — the photo steers the lines" : "Built-in sample depth"} />}
      {inputs.depth && <p className="text-[11px] leading-snug text-faint">Depth maps are read at full 16-bit precision from PNG. Make one with reference/python/depth_map_colab.ipynb.</p>}
      {error && <Notice level="error">{error}</Notice>}
    </div>
  );
}
