import { describe, expect, it } from "vitest";
import { combineCycleActive, combineFormula, emittedCount, geometryNames, hex, nextDraw, otherModeFields, pageCount, pageRows, renderModePreset } from "./inspection";
import { Inspection } from "./inspection.svelte";
import { inspectionTrace } from "./test/inspection";

it("bounds pages at 100 rows, including empty and partial pages", () => {
  const { rows } = inspectionTrace(205);
  expect(pageCount(0)).toBe(1);
  expect(pageCount(200)).toBe(2);
  expect(pageRows(rows, 0)).toHaveLength(100);
  expect(pageRows(rows, 1)[0].seq).toBe(100);
  expect(pageRows(rows, 8)).toHaveLength(5);
  expect(pageRows(rows, -1)[0].seq).toBe(0);
});
it("counts triangles within an emission and finds the next emitted command", () => {
  const { rows } = inspectionTrace();
  expect(emittedCount(rows[8])).toBe(1);
  expect(nextDraw(rows, null)).toBe(8);
  expect(nextDraw(rows, 8)).toBeNull();
});
it("decodes asymmetric combiner slots independently for both cycles", () => {
  const l = (6 << 20) | (6 << 15) | (6 << 12) | (6 << 9) | (7 << 5) | 15;
  const h = (6 << 28) | (7 << 24) | (6 << 21) | (0 << 18) | (6 << 15) | (6 << 12) | (6 << 9) | (7 << 6) | (7 << 3) | 4;
  expect(combineFormula(hex(l), hex(h), 0)).toEqual({ rgb: "(1 − CENTER) × SCALE + 1", alpha: "(1 − 1) × PRIM_LOD_FRAC + 1" });
  expect(combineFormula(hex(l), hex(h), 1)).toEqual({ rgb: "(NOISE − K4) × K5 + 0", alpha: "(1 − 0) × LOD_FRACTION + SHADE" });
  expect(combineFormula("0xFFFFFFFF", "0xFFFFFFFF", 0).rgb).toBe("(0 − 0) × 0 + 0");
});
it("matches render modes separately from alpha compare and depth source", () => {
  expect(renderModePreset("0x0F0A4047")).toBe("G_RM_OPA_SURF / G_RM_OPA_SURF2");
  expect(renderModePreset("0x00502078")).toBe("G_RM_AA_ZB_OPA_SURF / G_RM_AA_ZB_OPA_SURF2");
  expect(renderModePreset("0xC8100000")).toBe("G_RM_FOG_SHADE_A / G_RM_AA_ZB_OPA_SURF2");
  expect(renderModePreset("0x005020F8")).toBe("custom");
  expect(otherModeFields("0x00208000", "0x00000037")).toMatchObject({cycle:"copy", textureLut:"RGBA16", alphaCompare:"dither", depthSource:"primitive", zCompare:true, zUpdate:true});
});
it("uses target geometry names and retains unknown bits", () => {
  expect(geometryNames("0x80000200", "F3DEX2")).toEqual({names:["G_CULL_FRONT"],unknown:"0x80000000"});
  expect(geometryNames("0x00400202", "F3D").names).toEqual(["G_TEXTURE_ENABLE","G_SHADING_SMOOTH","G_POINT_LIGHTING"]);
});
describe("inspection selection", () => {
  it("links every repeated occurrence and preserves the chosen execution", () => {
    const inspection = new Inspection();
    const trace = inspectionTrace(205);
    trace.rows[101].line = trace.rows[1].line;
    trace.rows[101].pc = trace.rows[1].pc;
    inspection.open = true;
    inspection.capture(trace);
    inspection.select(101);
    expect(inspection.page).toBe(1);
    expect(inspection.selectLine(20)).toBe(101);
    expect(inspection.navigation).toBe(1);
    expect(inspection.selectLine(19)).toBe(0);
    expect(inspection.page).toBe(0);
    expect(inspection.selectLine(999)).toBeNull();
    expect(inspection.linkedLine).toBeNull();
  });
  it("bounds stepping and drops stale links and closed traces", () => {
    const inspection = new Inspection();
    inspection.open = true;
    inspection.capture(inspectionTrace());
    expect(inspection.step(1)).toBe(0);
    inspection.select(0);
    expect(inspection.step(-1)).toBeNull();
    expect(inspection.nextDraw()).toBe(8);
    inspection.invalidate();
    expect(inspection.select(8)).toBe(false);
    expect(inspection.selectLine(27)).toBeNull();
    expect(inspection.linkedLine).toBeNull();
    inspection.capture(inspectionTrace());
    expect(inspection.stale).toBe(false);
    inspection.close();
    expect(inspection.trace).toBeNull();
    expect(inspection.selectedSeq).toBeNull();
  });
});

it("marks the second combiner slot active in one-cycle mode", () => {
  expect(combineCycleActive("0x00000000", 0)).toBe(false);
  expect(combineCycleActive("0x00000000", 1)).toBe(true);
  expect(combineCycleActive("0x00100000", 0)).toBe(true);
  expect(combineCycleActive("0x00100000", 1)).toBe(true);
  expect(combineCycleActive("0x00200000", 1)).toBe(false);
  expect(combineCycleActive("0x00300000", 0)).toBe(false);
});
