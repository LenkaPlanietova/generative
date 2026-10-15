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
  const [download] = await Promise.all([page.waitForEvent("download"), dialog.getByRole("button", { name: "Download SVG" }).click()]);
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
