/// <reference types="node" />
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { initSync, inspect } from "../wasm/n64_toys.js";
import { combineFormula, renderModePreset, type Trace } from "./inspection";
import source from "./docs/starter.n64?raw";

initSync({module: new WebAssembly.Module(new Uint8Array(readFileSync(new URL("../wasm/n64_toys_bg.wasm", import.meta.url))))});

it("consumes the real bridge payload and decodes the starter's state", () => {
  for (const microcode of ["F3DEX2", "F3D"]) {
    for (const time of [0,1.37]) {
      const trace = inspect(source,time,[],microcode) as Trace;
      expect(trace.error).toBeNull();
      expect(trace.rows).toHaveLength(10);
      expect(trace.rows[8].decoded).toEqual({mnemonic:"G_TRI1",operands:[]});
      expect(trace.rows.map(row=>row.line)).toEqual([19,20,21,22,23,24,25,26,27,28]);
      expect(trace.rows[9].nextPc).toBeNull();
      expect(trace.rows[8].draws[0]).toMatchObject({kind:"triangles",runIndex:0,opIndex:null,materialIndex:0});
      const snapshot = trace.states[trace.rows[8].state];
      expect(renderModePreset(snapshot.otherModeL)).toBe("G_RM_OPA_SURF / G_RM_OPA_SURF2");
      expect(combineFormula(snapshot.combineL,snapshot.combineH,1)).toEqual({rgb:"(0 − 0) × 0 + SHADE",alpha:"(0 − 0) × 0 + SHADE"});
      expect(snapshot.tiles).toHaveLength(8);
      expect(snapshot.lights).toHaveLength(8);
      expect(trace.sourceLines[8].text).toContain("gsSP1Triangle");
    }
  }
});
it("returns assembly and input errors without needing a renderer", () => {
  expect(inspect("invalid",0,[],"F3DEX2")).toMatchObject({error:"assembly failed",rows:[],diags:[{line:1,kind:"src",seq:null,pc:null}]});
  expect(inspect(source,0,[],"unknown")).toMatchObject({error:"unknown microcode: unknown",rows:[],entry:null});
  const invalid = inspect(source,0,null,"F3DEX2") as Trace;
  expect(invalid.error).toContain("invalid texture inputs");
  expect(invalid.entry).toBeNull();
});

it.each(["G_RM_OPA_SURF", "G_RM_AA_ZB_OPA_SURF", "G_RM_AA_ZB_XLU_SURF", "G_RM_AA_ZB_TEX_EDGE", "G_RM_CLD_SURF", "G_RM_AA_ZB_OPA_DECAL", "G_RM_AA_ZB_XLU_DECAL"])("matches %s against assembled GBI words", mode => {
  const changed = source.replace("G_RM_OPA_SURF, G_RM_OPA_SURF2", `${mode}, ${mode}2`);
  const trace = inspect(changed,0,[],"F3DEX2") as Trace;
  expect(trace.error).toBeNull();
  expect(renderModePreset(trace.states[trace.rows[5].state].otherModeL)).toBe(`${mode} / ${mode}2`);
});
