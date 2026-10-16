import { describe, expect, it } from "vitest";
import { DRAFT_SCALE, draftParams } from "../src/algorithms/draft";
import { getAlgorithm } from "../src/algorithms/registry";
import { defaultParams } from "../src/algorithms/types";
import { DEFAULT_PAPER } from "../src/core/paper";
import { type GenerateRequest, runPipeline } from "../src/pipeline";
import { DEFAULT_OPTIMIZE } from "../src/plotter/optimize";
import { DEFAULT_PROFILE } from "../src/plotter/profiles";

const req = (algorithmId: string, over: Partial<GenerateRequest> = {}): GenerateRequest => ({
  algorithmId, params: defaultParams(getAlgorithm(algorithmId)!), seed: 5, paper: DEFAULT_PAPER, optimize: DEFAULT_OPTIMIZE, profile: DEFAULT_PROFILE, ...over,
});

describe("adaptive preview quality", () => {
  it("draft settings only touch existing quality parameters", () => {
    for (const [id, scale] of Object.entries(DRAFT_SCALE)) {
      const algo = getAlgorithm(id);
      expect(algo, id).toBeDefined();
      for (const p of Object.keys(scale)) {
        const def = algo!.parameters.find((d) => d.id === p);
        expect(def?.type, `${id}.${p}`).toBe("number");
        expect(def?.group, `${id}.${p}`).toBe("Advanced");
      }
    }
  });

  it("a draft is much faster and shows the same drawing at lower precision", async () => {
    const t0 = performance.now(), fin = await runPipeline(req("flow-field"));
    const t1 = performance.now(), dra = await runPipeline(req("flow-field", { quality: "draft" }));
    const t2 = performance.now();
    expect(t2 - t1).toBeLessThan((t1 - t0) * 0.6);
    expect(Math.abs(dra.after.penDown - fin.after.penDown) / fin.after.penDown).toBeLessThan(0.15);
  });

  it("final quality never uses draft parameters, and algorithms without a draft are unchanged", () => {
    const p = defaultParams(getAlgorithm("flow-field")!);
    expect(draftParams("flow-field", p).resolution).toBeLessThan(p.resolution as number);
    const rd = defaultParams(getAlgorithm("reaction-diffusion")!);
    expect(draftParams("reaction-diffusion", rd)).toEqual(rd);
  });
});

describe("safety limit", () => {
  it("refuses drawings over the point limit with a clear message", async () => {
    await expect(runPipeline(req("flow-field", { maxPoints: 1000 }))).rejects.toThrow(/over the safety limit of 1,000/);
  });
});
