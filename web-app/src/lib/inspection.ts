import type { Diagnostic } from "./playground.svelte";

export type Hex = string;
export type FrameImage = { fmt: number; siz: number; width: number; addr: Hex };
export type Target = { pairIndex: number; colorImage: FrameImage; depthImage: Hex | null; isDepthClear: boolean };
export type Draw =
  | { kind: "triangles"; target: Target | null; runIndex: number | null; opIndex: number | null; materialIndex: number; renderModeIndex: number; indexStart: number; indices: number[] }
  | { kind: "fillRect"; target: Target; opIndex: number; rect: number[]; colorRaw: Hex }
  | { kind: "texRect"; target: Target; opIndex: number; rect: number[]; tile: number; uls: number; ult: number; dsdx: number; dtdy: number; flip: boolean; copyMode: boolean; fbSource: Hex | null };
export type Tile = { uls: number; ult: number; lrs: number; lrt: number; width: number; height: number; fmt: number; siz: number; palette: number; cms: number; cmt: number; masks: number; maskt: number; shifts: number; shiftt: number; line: number; tmemAddr: number };
export type InspectionState = {
  geometryMode: Hex; geometryNames: string[];
  texture: { tile: number; level: number; on: boolean; sc: number; tc: number };
  modelviewDepth: number; modelview: number[][]; projection: number[][];
  viewportScale: number[]; viewportTranslation: number[];
  lightCount: number; lights: [number[], number[]][]; ambient: number[]; lookatAxes: number[][];
  tiles: Tile[]; loadViaTile: boolean; textureImage: FrameImage;
  combineL: Hex; combineH: Hex; otherModeH: Hex; otherModeL: Hex;
  primColor: number[]; envColor: number[]; fogColor: number[]; blendColor: number[];
  fillColorRaw: Hex; colorImage: FrameImage; depthImage: Hex;
  scissor: { ulx: number; uly: number; lrx: number; lry: number; mode: number };
};
export type CommandWord = { pc: Hex; line: number | null; w0: Hex; w1: Hex; w1Addr: Hex };
export type InspectionRow = {
  seq: number; pc: Hex; line: number | null; depthBefore: number; depthAfter: number;
  flow: "next" | "call" | "branch" | "return" | "end" | "fault"; nextPc: Hex | null;
  words: CommandWord[]; decoded: { mnemonic: string; operands: [] }; state: number; draws: Draw[]; diagnostics: number[];
};
export type TraceDiagnostic = Diagnostic & { pc: Hex | null; seq: number | null };
export type Trace = {
  version: 1; time: number; microcode: string; entry: Hex | null;
  termination:
    | "end"
    | "bounds"
    | "runaway"
    | "stopped"
    | "cap"
    | "memory-read"
    | "rejected"
    | "unknown";
  dispatched: number; rows: InspectionRow[]; states: InspectionState[];
  sourceLines: { line: number; text: string }[]; diags: TraceDiagnostic[]; error: string | null;
};
export const PAGE_SIZE = 100;
export function pageCount(length: number): number { return Math.max(1, Math.ceil(length / PAGE_SIZE)); }
export function pageRows(rows: InspectionRow[], page: number): InspectionRow[] {
  const start = Math.max(0, Math.min(pageCount(rows.length) - 1, Math.trunc(page))) * PAGE_SIZE;
  return rows.slice(start, start + PAGE_SIZE);
}
export function emittedCount(row: InspectionRow): number {
  return row.draws.reduce((count, draw) => count + (draw.kind === "triangles" ? draw.indices.length / 3 : 1), 0);
}
export function nextDraw(rows: InspectionRow[], seq: number | null): number | null {
  return rows.find(row => row.seq > (seq ?? -1) && emittedCount(row) > 0)?.seq ?? null;
}
export function hex(value: number): Hex { return `0x${(value >>> 0).toString(16).toUpperCase().padStart(8, "0")}`; }
const common = ["COMBINED", "TEXEL0", "TEXEL1", "PRIMITIVE", "SHADE", "ENVIRONMENT"];
const colorA = [...common, "1", "NOISE"];
const colorB = [...common, "CENTER", "K4"];
const colorC = [...common, "SCALE", "COMBINED_ALPHA", "TEXEL0_ALPHA", "TEXEL1_ALPHA", "PRIMITIVE_ALPHA", "SHADE_ALPHA", "ENV_ALPHA", "LOD_FRACTION", "PRIM_LOD_FRAC", "K5"];
const colorD = [...common, "1", "0"];
const alphaC = ["LOD_FRACTION", "TEXEL0", "TEXEL1", "PRIMITIVE", "SHADE", "ENVIRONMENT", "PRIM_LOD_FRAC", "0"];
const bits = (word: number, shift: number, width: number) => (word >>> shift) & ((1 << width) - 1);
const formula = (a: string, b: string, c: string, d: string) => `(${a} − ${b}) × ${c} + ${d}`;
export function combineFormula(combineL: Hex, combineH: Hex, cycle: 0 | 1): { rgb: string; alpha: string } {
  const l = Number(combineL), h = Number(combineH);
  const [a, b, c, d, aa, ab, ac, ad] = cycle === 0
    ? [bits(l,20,4), bits(h,28,4), bits(l,15,5), bits(h,15,3), bits(l,12,3), bits(h,12,3), bits(l,9,3), bits(h,9,3)]
    : [bits(l,5,4), bits(h,24,4), bits(l,0,5), bits(h,6,3), bits(h,21,3), bits(h,3,3), bits(h,18,3), bits(h,0,3)];
  return { rgb: formula(colorA[a] ?? "0", colorB[b] ?? "0", colorC[c] ?? "0", colorD[d]), alpha: formula(colorD[aa], colorD[ab], alphaC[ac], colorD[ad]) };
}
export function combineCycleActive(otherModeH: Hex, cycle: 0 | 1): boolean {
  const cycleType = (Number(otherModeH) >>> 20) & 3;
  return cycleType === 1 || (cycleType === 0 && cycle === 1);
}
const renderModes: [string, number, number][] = [
  ["G_RM_OPA_SURF", 0x0c084040, 0x03020000],
  ["G_RM_AA_ZB_OPA_SURF", 0x00402078, 0x00100000],
  ["G_RM_AA_ZB_XLU_SURF", 0x004049d8, 0x00100000],
  ["G_RM_AA_ZB_TEX_EDGE", 0x00403078, 0x00100000],
  ["G_RM_CLD_SURF", 0x00404340, 0x00100000],
  ["G_RM_AA_ZB_OPA_DECAL", 0x00402d58, 0x00100000],
  ["G_RM_AA_ZB_XLU_DECAL", 0x00404dd8, 0x00100000],
];
export function renderModePreset(otherModeL: Hex): string {
  const mode = (Number(otherModeL) & 0xfffffff8) >>> 0;
  for (const [name, first, second] of renderModes) {
    if (((first | second) >>> 0) === mode) return `${name} / ${name}2`;
  }
  for (const [first, value] of [...renderModes, ["G_RM_FOG_SHADE_A", 0xc8000000, 0] as [string, number, number]]) {
    for (const [second, , value2] of renderModes) {
      if (((value | value2) >>> 0) === mode) return `${first} / ${second}2`;
    }
  }
  return "custom";
}
export function geometryNames(mode: Hex, microcode: string): { names: string[]; unknown: Hex } {
  const shared: [number, string][] = [[1,"G_ZBUFFER"],[4,"G_SHADE"],[0x10000,"G_FOG"],[0x20000,"G_LIGHTING"],[0x40000,"G_TEXTURE_GEN"],[0x80000,"G_TEXTURE_GEN_LINEAR"],[0x800000,"G_CLIPPING"]];
  const target: [number, string][] = microcode === "F3D"
    ? [[2,"G_TEXTURE_ENABLE"],[0x200,"G_SHADING_SMOOTH"],[0x1000,"G_CULL_FRONT"],[0x2000,"G_CULL_BACK"],[0x400000,"G_POINT_LIGHTING"]]
    : [[0x200,"G_CULL_FRONT"],[0x400,"G_CULL_BACK"],[0x200000,"G_SHADING_SMOOTH"]];
  const flags = [...shared, ...target].sort((a,b) => a[0]-b[0]);
  const raw = Number(mode);
  return { names: flags.filter(([mask]) => raw & mask).map(([,name]) => name), unknown: hex(raw & ~flags.reduce((mask,[bit]) => mask | bit, 0)) };
}
export function otherModeFields(h: Hex, l: Hex): Record<string, string | boolean> {
  const high = Number(h), low = Number(l);
  return {
    cycle: ["1 cycle", "2 cycle", "copy", "fill"][bits(high,20,2)],
    textureFilter: ["point", "reserved", "bilerp", "average"][bits(high,12,2)],
    textureLut: ["none", "reserved", "RGBA16", "IA16"][bits(high,14,2)],
    texturePerspective: Boolean(high & (1 << 19)),
    alphaCompare: ["none", "threshold", "reserved", "dither"][low & 3],
    depthSource: low & 4 ? "primitive" : "pixel",
    zCompare: Boolean(low & 0x10), zUpdate: Boolean(low & 0x20),
    zMode: ["opaque", "interpenetrating", "translucent", "decal"][bits(low,10,2)],
    antialias: Boolean(low & 8), imageRead: Boolean(low & 0x40), forceBlend: Boolean(low & 0x4000),
  };
}
export function matrixSummary(matrix: number[][]): string {
  const identity = matrix.every((row, i) => row.every((v,j) => v === (i === j ? 1 : 0)));
  return identity ? "identity" : `translation ${matrix[3].slice(0,3).join(", ")}`;
}
