import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";

import { decodePng, readPngHeader } from "./png.js";

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

function pngHeader(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(24);
  bytes.set(PNG_SIGNATURE);
  bytes.set([0, 0, 0, 13, 73, 72, 68, 82], 8);
  new DataView(bytes.buffer).setUint32(16, width);
  new DataView(bytes.buffer).setUint32(20, height);
  return bytes;
}

function onePixelPng(): Buffer {
  const png = new PNG({ width: 1, height: 1 });
  png.data.set([255, 0, 0, 255]);
  return PNG.sync.write(png);
}

describe("readPngHeader", () => {
  it("reads dimensions from a PNG whose first chunk is IHDR", () => {
    expect(readPngHeader(pngHeader(512, 384))).toEqual({
      width: 512,
      height: 384,
    });
  });

  it("rejects a bad PNG signature", () => {
    const bytes = pngHeader(1, 1);
    bytes[0] = 0;

    expect(readPngHeader(bytes)).toBeNull();
  });

  it("rejects a non-IHDR first chunk", () => {
    const bytes = pngHeader(1, 1);
    bytes[12] = "I".charCodeAt(0);
    bytes[13] = "D".charCodeAt(0);
    bytes[14] = "A".charCodeAt(0);
    bytes[15] = "T".charCodeAt(0);

    expect(readPngHeader(bytes)).toBeNull();
  });

  it("rejects a truncated header", () => {
    expect(readPngHeader(pngHeader(1, 1).subarray(0, 23))).toBeNull();
  });

  it("rejects zero dimensions", () => {
    expect(readPngHeader(pngHeader(0, 1))).toBeNull();
    expect(readPngHeader(pngHeader(1, 0))).toBeNull();
  });

  it("exposes huge declared dimensions before a full decode is attempted", () => {
    const tinyFileWithHugeDimensions = pngHeader(100_000, 100_000);
    const header = readPngHeader(tinyFileWithHugeDimensions);
    const callerAcceptsHeader =
      header !== null && header.width <= 512 && header.height <= 512;

    expect(header).toEqual({ width: 100_000, height: 100_000 });
    expect(callerAcceptsHeader).toBe(false);
    // Callers must reject oversized IHDR dimensions here, before decodePng can
    // ask pngjs to allocate storage based on this untrusted header.
  });
});

describe("decodePng", () => {
  it("fully decodes a real PNG", () => {
    expect(decodePng(onePixelPng())).toEqual({ width: 1, height: 1 });
  });

  it("returns an error instead of throwing for truncated input", () => {
    const truncated = onePixelPng().subarray(0, 20);

    expect(() => decodePng(truncated)).not.toThrow();
    expect(decodePng(truncated)).toEqual({ error: expect.any(String) });
  });

  it("returns an error instead of throwing for corrupt input", () => {
    const corrupt = Buffer.from(onePixelPng());
    corrupt[corrupt.length - 8] ^= 0xff;

    expect(() => decodePng(corrupt)).not.toThrow();
    expect(decodePng(corrupt)).toEqual({ error: expect.any(String) });
  });
});
