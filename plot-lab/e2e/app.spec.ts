import { readFile } from "node:fs/promises";
import { expect, type Page, test } from "@playwright/test";

const ready = (page: Page) => expect(page.getByTestId("gen-status")).toContainText("Ready", { timeout: 30_000 });
const pathCount = async (page: Page) => Number((await page.getByTestId("stat-paths").innerText()).replace(/\D/g, ""));
const ink = (page: Page) => page.getByTestId("stat-ink").innerText();

/** Dark pixels on the preview canvas — proves the artwork actually rendered. */
const inkedPixels = (page: Page) => page.evaluate(() => {
  const c = document.querySelector<HTMLCanvasElement>('[aria-label="Artwork preview"]')!;
  const d = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
  let n = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i] < 120 && d[i + 1] < 120 && d[i + 2] < 120 && d[i] + d[i + 1] + d[i + 2] > 0) n++;
  return n;
});

test("generate, adjust, vary, change paper, export a valid plotter SVG", async ({ page }) => {
  await page.goto("/");
  await ready(page);
  expect(await pathCount(page)).toBeGreaterThan(50);
  expect(await inkedPixels(page)).toBeGreaterThan(5_000);

  // Adjusting a slider regenerates the artwork.
  const before = await ink(page);
  await page.locator('[data-control="darkestSpacing"] input[type="number"]').fill("1.4");
  await page.locator('[data-control="darkestSpacing"] input[type="number"]').press("Enter");
  await expect.poll(() => ink(page), { timeout: 30_000 }).not.toBe(before);
  await ready(page);

  // A new seed gives a new variation; "Back" restores the old one exactly.
  const seed = await page.getByTestId("stat-seed").innerText(), inkA = await ink(page);
  await page.getByRole("button", { name: "Next variation (seed + 1)" }).click();
  await expect(page.getByTestId("stat-seed")).not.toHaveText(seed);
  await expect.poll(() => ink(page), { timeout: 30_000 }).not.toBe(inkA);
  await ready(page);
  await page.getByRole("button", { name: "Restore previous seed" }).click();
  await expect(page.getByTestId("stat-seed")).toHaveText(seed);
  await expect.poll(() => ink(page), { timeout: 30_000 }).toBe(inkA);

  // Physical paper size.
  await page.getByRole("button", { name: "Paper & plotter" }).click();
  await page.locator("#s-paper").selectOption("A3");
  await expect(page.getByTestId("stat-paper")).toHaveText(/297 × 420 mm/);
  await expect.poll(async () => (await page.getByTestId("gen-status").innerText()).includes("Ready") && (await pathCount(page)) > 0, { timeout: 30_000 }).toBe(true);
  await page.waitForTimeout(500);
  await ready(page);

  // Export: validation passes, the file downloads.
  await page.getByRole("button", { name: "Export SVG" }).click();
  const dialog = page.getByRole("dialog", { name: "Export SVG" });
  await expect(dialog.getByTestId("validation")).toContainText("All export checks passed");
  // The preview image really loads (a revoked or broken blob URL leaves naturalWidth at 0).
  await expect.poll(() => dialog.getByTestId("svg-preview").evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  const [download] = await Promise.all([page.waitForEvent("download"), dialog.getByRole("button", { name: "Download SVG" }).click()]);
  expect(await download.failure()).toBeNull();
  const svg = await readFile((await download.path())!, "utf8");

  // Parse, check, and render the exported file in the browser.
  const report = await page.evaluate(async (text) => {
    const doc = new DOMParser().parseFromString(text, "image/svg+xml");
    const root = doc.documentElement, paths = [...doc.querySelectorAll("path")];
    const group = doc.querySelector("g")!;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, bad = 0;
    for (const p of paths) {
      const nums = p.getAttribute("d")!.replace(/[MLZ]/g, " ").trim().split(/[\s,]+/).map(Number);
      for (let i = 0; i < nums.length; i += 2) {
        const [x, y] = [nums[i], nums[i + 1]];
        if (!Number.isFinite(x) || !Number.isFinite(y)) bad++;
        minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      }
    }
    // Render the SVG file itself and count inked pixels.
    const img = new Image();
    img.src = URL.createObjectURL(new Blob([text], { type: "image/svg+xml" }));
    await img.decode();
    const c = document.createElement("canvas");
    c.width = 594; c.height = 840;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let inked = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] < 160) inked++;
    return {
      parseError: !!doc.querySelector("parsererror"), width: root.getAttribute("width"), height: root.getAttribute("height"),
      viewBox: root.getAttribute("viewBox"), paths: paths.length, fill: group.getAttribute("fill"), stroke: group.getAttribute("stroke"),
      strokeWidth: Number(group.getAttribute("stroke-width")), images: doc.querySelectorAll("image").length,
      bad, minX, minY, maxX, maxY, inkedFraction: inked / (c.width * c.height),
    };
  }, svg);

  expect(report.parseError).toBe(false);
  expect(report).toMatchObject({ width: "297mm", height: "420mm", viewBox: "0 0 297 420", fill: "none", stroke: "#000000", images: 0, bad: 0 });
  expect(report.paths).toBe(await pathCount(page));
  expect(report.strokeWidth).toBeGreaterThan(0);
  expect(report.minX).toBeGreaterThanOrEqual(20 - 0.01);
  expect(report.minY).toBeGreaterThanOrEqual(20 - 0.01);
  expect(report.maxX).toBeLessThanOrEqual(277 + 0.01);
  expect(report.maxY).toBeLessThanOrEqual(400 + 0.01);
  expect(report.inkedFraction).toBeGreaterThan(0.01); // not visually blank
});

test("export is blocked when the stroke would be invisible", async ({ page }) => {
  await page.goto("/");
  await ready(page);
  await page.locator("#c-strokeColor").fill("#ffffff");
  await page.getByRole("button", { name: "Export SVG" }).click();
  const dialog = page.getByRole("dialog", { name: "Export SVG" });
  await expect(dialog.locator('[data-level="error"]')).toContainText("too light");
  await expect(dialog.getByRole("button", { name: "Download SVG" })).toBeDisabled();
});

test("warns when spacing is below 1.2 × pen width", async ({ page }) => {
  await page.goto("/");
  await ready(page);
  await page.locator('[data-control="penWidth"] input[type="number"]').fill("0.8");
  await page.locator('[data-control="penWidth"] input[type="number"]').press("Enter");
  await expect(page.getByRole("alert").first()).toContainText("solid black");
});

test("zoom with the + / − buttons and keys", async ({ page }) => {
  await page.goto("/");
  await ready(page);
  const zoom = () => page.getByTitle(/^Zoom \(100 %/).innerText().then((t) => Number(t.replace("%", "")));
  const z0 = await zoom();
  await page.getByRole("button", { name: "Zoom in (+)" }).click();
  expect(await zoom()).toBeGreaterThan(z0);
  await page.getByRole("button", { name: "Zoom out (−)" }).click();
  await page.getByRole("button", { name: "Zoom out (−)" }).click();
  expect(await zoom()).toBeLessThan(z0);
  await page.keyboard.press("0");
  expect(await zoom()).toBe(z0);
  await page.keyboard.press("+");
  expect(await zoom()).toBeGreaterThan(z0);
});

test("every algorithm generates and passes export validation", async ({ page }) => {
  test.setTimeout(360_000);
  await page.goto("/");
  await ready(page);
  for (const name of ["Noise Flow", "Contour Field", "Topographic Fields", "Wave Distortion", "Radial Geometry", "Spirograph", "Lissajous Curves",
    "Harmonograph", "Moiré", "Guilloché", "Interference", "Reaction-Diffusion",
    "Redraw", "Contour Portrait", "Wave Portrait", "Adaptive Hatching", "Image Displacement", "Flow Field"]) {
    await page.getByRole("button", { name: new RegExp(`^${name}`) }).click();
    await expect(page.locator("header")).toContainText(name);
    await expect.poll(async () => (await page.getByTestId("gen-status").innerText()).includes("Ready"), { timeout: 30_000 }).toBe(true);
    await page.waitForTimeout(400);
    await ready(page);
    expect(await pathCount(page), name).toBeGreaterThan(0);
    expect(await inkedPixels(page), name).toBeGreaterThan(500);
    await page.getByRole("button", { name: "Export SVG" }).click();
    await expect(page.getByRole("dialog").getByTestId("validation"), name).toContainText("All export checks passed");
    await page.keyboard.press("Escape");
  }
  // Pure-maths curves say when the seed has no effect.
  await page.getByRole("button", { name: /^Spirograph/ }).click();
  await expect(page.getByTestId("seed-unused")).toBeVisible();
});

test("import an image, redraw it and export", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto("/");
  await ready(page);
  await page.getByRole("button", { name: /^Redraw/ }).click();
  await expect(page.getByTestId("image-photo")).toContainText("Built-in sample head");
  await page.getByLabel("Load Image").setInputFiles(new URL("../reference/examples/source_lineart.png", import.meta.url).pathname);
  await expect(page.getByTestId("image-photo")).toContainText("source_lineart.png");
  await expect(page.getByTestId("image-photo")).toContainText("1133 × 1388 · 8-bit");
  await expect.poll(async () => (await page.getByTestId("gen-status").innerText()).includes("Ready") && (await pathCount(page)) > 300, { timeout: 90_000 }).toBe(true);
  await page.waitForTimeout(500);
  await ready(page);
  expect(await inkedPixels(page)).toBeGreaterThan(5_000);
  // Reference overlay toggles on and off.
  await page.getByRole("button", { name: "Show reference image" }).click();
  await expect(page.getByRole("button", { name: "Show reference image" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Export SVG" }).click();
  await expect(page.getByRole("dialog").getByTestId("validation")).toContainText("All export checks passed");
  await page.keyboard.press("Escape");
  // Removing the image falls back to the sample.
  await page.getByRole("button", { name: "Remove Image" }).click();
  await expect(page.getByTestId("image-photo")).toContainText("Built-in sample head");
});

test("save a project, start a new one, and open the saved file again", async ({ page }) => {
  await page.goto("/");
  await ready(page);
  await page.getByLabel("Project name").fill("Test piece");
  await page.locator("#seed").fill("1234");
  await page.locator('[data-control="noiseSize"] input[type="number"]').fill("90");
  await page.locator('[data-control="noiseSize"] input[type="number"]').press("Enter");
  await expect(page.getByTestId("stat-seed")).toHaveText(/\b1234$/);
  await page.getByRole("button", { name: "Project" }).click();
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("menuitem", { name: "Save project" }).click()]);
  expect(download.suggestedFilename()).toBe("Test_piece.plotlab.json");
  const file = (await download.path())!;

  await page.getByRole("button", { name: "Project" }).click();
  await page.getByRole("menuitem", { name: "New project" }).click();
  await expect(page.getByLabel("Project name")).toHaveValue("Untitled");
  await expect(page.getByTestId("stat-seed")).not.toHaveText(/\b1234$/);

  await page.getByLabel("Open project file").setInputFiles(file);
  await expect(page.getByLabel("Project name")).toHaveValue("Test piece");
  await expect(page.getByTestId("stat-seed")).toHaveText(/\b1234$/);
  await expect(page.locator('[data-control="noiseSize"] input[type="number"]')).toHaveValue("90");
  // It is listed under Recent.
  await page.getByRole("button", { name: "Project" }).click();
  await expect(page.getByRole("menuitem", { name: /Test piece/ })).toBeVisible();
});

test("presets save and restore parameters", async ({ page }) => {
  await page.goto("/");
  await ready(page);
  await page.getByRole("button", { name: "Presets" }).click();
  await page.locator('[data-control="noiseSize"] input[type="number"]').fill("150");
  await page.locator('[data-control="noiseSize"] input[type="number"]').press("Enter");
  await page.getByLabel("New preset name").fill("Big swirls");
  await page.getByRole("button", { name: "Save preset" }).click();
  await page.locator('[data-control="noiseSize"] input[type="number"]').fill("20");
  await page.locator('[data-control="noiseSize"] input[type="number"]').press("Enter");
  await page.getByLabel("Preset", { exact: true }).selectOption({ label: "Big swirls" });
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page.locator('[data-control="noiseSize"] input[type="number"]')).toHaveValue("150");
});

test("variation explorer generates real variations and applies one", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/");
  await ready(page);
  const seed = await page.getByTestId("stat-seed").innerText();
  await page.getByRole("button", { name: "Variations" }).click();
  const dialog = page.getByRole("dialog", { name: "Variations" });
  await expect(dialog.getByTestId("variation")).toHaveCount(4);
  await expect.poll(async () => (await dialog.getByTestId("variation-stats").allInnerTexts()).filter((t) => /paths/.test(t)).length, { timeout: 60_000 }).toBe(4);
  await dialog.getByRole("group", { name: "Count" }).getByRole("button", { name: "9", exact: true }).click();
  await expect(dialog.getByTestId("variation")).toHaveCount(9);
  await dialog.getByRole("group", { name: "Count" }).getByRole("button", { name: "4", exact: true }).click();
  await expect.poll(async () => (await dialog.getByTestId("variation-stats").allInnerTexts()).filter((t) => /paths/.test(t)).length, { timeout: 60_000 }).toBe(4);
  await dialog.getByTestId("variation").nth(2).click();
  await dialog.getByRole("button", { name: "Apply" }).click();
  await expect(page.getByTestId("stat-seed")).not.toHaveText(seed);
});

test("clip to shape cuts the drawing and still exports cleanly", async ({ page }) => {
  await page.goto("/");
  await ready(page);
  const before = await pathCount(page);
  await page.getByRole("switch", { name: "Clip to shape" }).click();
  await page.getByRole("switch", { name: "Draw outline (own layer)" }).click();
  await expect.poll(async () => (await page.getByTestId("gen-status").innerText()).includes("Ready") && (await pathCount(page)) !== before, { timeout: 30_000 }).toBe(true);
  await page.getByRole("button", { name: "Export SVG" }).click();
  const dialog = page.getByRole("dialog", { name: "Export SVG" });
  await expect(dialog.getByTestId("validation")).toContainText("All export checks passed");
  const [download] = await Promise.all([page.waitForEvent("download"), dialog.getByRole("button", { name: "Download SVG" }).click()]);
  const svg = await readFile((await download.path())!, "utf8");
  expect(svg).toContain('inkscape:label="2 clip outline"');
});

test("a quick draft appears while adjusting, then the full-quality drawing", async ({ page }) => {
  await page.goto("/");
  await ready(page);
  const seen: string[] = [];
  const watch = setInterval(async () => { try { seen.push(await page.getByTestId("gen-status").innerText()); } catch { /* page closing */ } }, 40);
  await page.locator('[data-control="noiseSize"] input[type="number"]').fill("95");
  await page.locator('[data-control="noiseSize"] input[type="number"]').press("Enter");
  await expect.poll(() => seen.some((t) => /Draft/.test(t)), { timeout: 10_000 }).toBe(true);
  await expect(page.getByTestId("gen-status")).toContainText(/Ready · \d/, { timeout: 30_000 });
  clearInterval(watch);
  // Export is only offered for the full-quality drawing.
  await page.getByRole("button", { name: "Export SVG" }).click();
  await expect(page.getByRole("dialog").getByTestId("validation")).toContainText("All export checks passed");
});

test("returning to an earlier setting is served from the cache", async ({ page }) => {
  await page.goto("/");
  await ready(page);
  await page.getByRole("button", { name: "Next variation (seed + 1)" }).click();
  await expect(page.getByTestId("gen-status")).toContainText(/Ready · \d/, { timeout: 30_000 });
  await page.getByRole("button", { name: "Restore previous seed" }).click();
  await expect(page.getByTestId("gen-status")).toContainText("Ready · from cache", { timeout: 5_000 });
});

test("keyboard shortcuts", async ({ page }) => {
  await page.goto("/");
  await ready(page);
  const seed = await page.getByTestId("stat-seed").innerText();
  await page.locator("body").press("r");
  await expect(page.getByTestId("stat-seed")).not.toHaveText(seed);
  await page.locator("body").press("b");
  await expect(page.getByTestId("stat-seed")).toHaveText(seed);
  await page.locator("body").press("?");
  await expect(page.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Keyboard shortcuts" })).toHaveCount(0);
  const [download] = await Promise.all([page.waitForEvent("download"), page.keyboard.press("ControlOrMeta+s")]);
  expect(download.suggestedFilename()).toMatch(/\.plotlab\.json$/);
  // Typing in a field never triggers shortcuts.
  await page.getByLabel("Project name").fill("rrr");
  await expect(page.getByTestId("stat-seed")).toHaveText(seed);
});

test("multi-layer drawings export one file per pen, singly or as a zip", async ({ page }) => {
  await page.goto("/");
  await ready(page);
  const before = await pathCount(page);
  await page.getByRole("switch", { name: "Clip to shape" }).click();
  await page.getByRole("switch", { name: "Draw outline (own layer)" }).click();
  await expect.poll(async () => (await page.getByTestId("gen-status").innerText()).includes("Ready") && (await pathCount(page)) !== before, { timeout: 30_000 }).toBe(true);
  await page.getByRole("button", { name: "Export SVG" }).click();
  const dialog = page.getByRole("dialog", { name: "Export SVG" });
  const files = dialog.getByTestId("layer-files");
  await expect(files).toContainText("2 clip outline");
  const [one] = await Promise.all([page.waitForEvent("download"), files.getByRole("button", { name: "Download layer 2" }).click()]);
  expect(one.suggestedFilename()).toMatch(/_layer2-clip_outline\.svg$/);
  const svg = await readFile((await one.path())!, "utf8");
  expect(svg).toContain('inkscape:label="2 clip outline"');
  expect(svg).not.toContain('inkscape:label="1 ');
  const [all] = await Promise.all([page.waitForEvent("download"), files.getByRole("button", { name: /All \(\.zip\)/ }).click()]);
  expect(all.suggestedFilename()).toMatch(/_layers\.zip$/);
  const zip = await readFile((await all.path())!);
  expect(zip.subarray(0, 4).toString("hex")).toBe("504b0304");
  expect(zip.toString("latin1")).toContain("_layer1-");
});

test("time calibration scales the estimate to a real plot", async ({ page }) => {
  await page.goto("/");
  await ready(page);
  await page.getByRole("button", { name: "Paper & plotter" }).click();
  const cal = page.getByTestId("time-calibration");
  await expect(cal.getByTestId("time-factor")).toHaveText("none");
  await cal.getByLabel("Real plot time in minutes").fill("30");
  await cal.getByRole("button", { name: "Calibrate" }).click();
  await expect(cal.getByTestId("time-factor")).not.toHaveText("none");
  await expect(page.getByTestId("stat-time")).toContainText("→ 30 min");
  await cal.getByRole("button", { name: "Reset calibration" }).click();
  await expect(cal.getByTestId("time-factor")).toHaveText("none");
});

test("plot layers: draw a mask, split into 1 object / 2 background, export for AxiDraw", async ({ page }) => {
  await page.goto("/");
  await ready(page);
  await page.getByRole("button", { name: /^Wave Portrait/ }).click();
  await ready(page);
  await page.getByRole("button", { name: "Plot layers", exact: true }).click();
  await page.getByRole("switch", { name: "Split into plot layers" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "no mask yet" })).toBeVisible({ timeout: 30_000 });

  // Draw a polygon mask on the canvas: click corners, Enter closes it.
  await page.getByRole("button", { name: "Draw the Plot Layers mask" }).click();
  await expect(page.getByTestId("canvas-hint")).toContainText("Drawing the mask");
  const box = (await page.getByLabel("Artwork preview").boundingBox())!;
  const W = 210, H = 297, zoom = Math.min((box.width - 48) / W, (box.height - 84) / H);
  const ox = box.x + (box.width - W * zoom) / 2, oy = box.y + 60 + (box.height - 84 - H * zoom) / 2;
  for (const [x, y] of [[70, 60], [140, 60], [150, 150], [140, 240], [70, 240], [60, 150]]) await page.mouse.click(ox + x * zoom, oy + y * zoom);
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("mask-status")).toHaveText("6 points");
  await expect(page.getByTestId("cut-stats")).toContainText("cuts", { timeout: 30_000 });
  await ready(page);
  await expect(page.getByTestId("ink-bars")).toContainText("1 object");
  await expect(page.getByTestId("ink-bars")).toContainText("2 background");

  await page.getByRole("button", { name: "Export SVG" }).click();
  const dialog = page.getByRole("dialog", { name: "Export SVG" });
  await expect(dialog.getByTestId("validation")).toContainText("All export checks passed");
  await expect(dialog.getByTestId("plot-instructions")).toContainText("Layers tab -> layer 1 (\"object\")");
  const [file] = await Promise.all([page.waitForEvent("download"), dialog.getByRole("button", { name: "Download SVG" }).click()]);
  const svg = await readFile((await file.path())!, "utf8");
  const labels = [...svg.matchAll(/inkscape:label="([^"]*)"/g)].map((m) => m[1]);
  expect(labels).toEqual(["1 object", "2 background", "%mask"]);
  expect(svg).toContain('"plotLayers":{');
  const [zip] = await Promise.all([page.waitForEvent("download"), dialog.getByTestId("layer-files").getByRole("button", { name: /All \(\.zip\)/ }).click()]);
  expect((await readFile((await zip.path())!)).toString("latin1")).toContain("_instructions.txt");
});
