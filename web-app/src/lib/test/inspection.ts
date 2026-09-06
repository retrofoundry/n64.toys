import type { InspectionState, Trace } from "../inspection";

export function inspectionTrace(count = 10): Trace {
  const matrix = [[1,0,0,0],[0,1,0,0],[0,0,1,0],[0,0,0,1]];
  const snapshot: InspectionState = {
    geometryMode: "0x00000204", geometryNames: ["G_SHADE", "G_CULL_FRONT"],
    texture: { tile: 0, level: 0, on: false, sc: 0, tc: 0 },
    modelviewDepth: 1, modelview: matrix, projection: matrix,
    viewportScale: [1,1,1], viewportTranslation: [0,0,0],
    lightCount: 0, lights: Array.from({length: 8}, () => [[0,0,0],[0,0,0]]), ambient: [1,1,1], lookatAxes: [[1,0,0],[0,1,0]],
    tiles: Array.from({length: 8}, () => ({ uls:0, ult:0, lrs:0, lrt:0, width:0, height:0, fmt:0, siz:0, palette:0, cms:0, cmt:0, masks:0, maskt:0, shifts:0, shiftt:0, line:0, tmemAddr:0 })),
    loadViaTile: false, textureImage: { fmt:0, siz:0, width:0, addr:"0x00000000" },
    combineL: "0xFCFFFFFF", combineH: "0xFFFE793C", otherModeH: "0x00000000", otherModeL: "0x0F0A4040",
    primColor:[255,255,255,255], envColor:[0,0,0,255], fogColor:[0,0,0,255], blendColor:[0,0,0,255],
    fillColorRaw:"0x00000000", colorImage:{ fmt:0, siz:0, width:0, addr:"0x00000000" }, depthImage:"0x00000000",
    scissor:{ulx:0, uly:0, lrx:640, lry:480, mode:0},
  };
  return {
    version:1, time:0, microcode:"F3DEX2", entry:"0x00000100", termination:"end", dispatched:count,
    rows:Array.from({length:count}, (_, seq) => ({ seq, pc:`0x${(256+seq*8).toString(16).padStart(8,"0")}`, line:seq+19, depthBefore:0, depthAfter:0, flow:seq===count-1 ? "end" : "next", nextPc:null,
      words:[{pc:"0x00000100",line:seq+19,w0:"0x05000000",w1:"0x00000000",w1Addr:"0x00000000"}], decoded:{mnemonic:seq===8 ? "G_TRI1" : "G_MTX",operands:[]}, state:0,
      draws:seq===8 ? [{kind:"triangles",target:null,runIndex:3,opIndex:null,materialIndex:1,renderModeIndex:0,indexStart:0,indices:[0,1,2]}] : [], diagnostics:[] })),
    states:[snapshot], sourceLines:Array.from({length:count},(_,seq)=>({line:seq+19,text:seq===8 ? "gsSP1Triangle(0, 1, 2, 0)" : "gsSPMatrix(m, 0)"})), diags:[], error:null,
  };
}
