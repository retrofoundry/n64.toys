// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { captureThumbnail } from "./thumbnail";

const THUMBNAIL_MAX_BYTES = 512 * 1024;

function stubOffscreenCanvas(blob: Blob | null | Error) {
  const drawImage = vi.fn();
  const convertToBlob = vi.fn(async () => {
    if (blob instanceof Error) throw blob;
    return blob;
  });
  const constructor = vi.fn();
  class MockOffscreenCanvas {
    constructor(width: number, height: number) {
      constructor(width, height);
    }

    getContext() {
      return { drawImage };
    }

    convertToBlob = convertToBlob;
  }
  vi.stubGlobal("OffscreenCanvas", MockOffscreenCanvas);
  return { constructor, drawImage, convertToBlob };
}

afterEach(() => vi.unstubAllGlobals());

describe("captureThumbnail", () => {
  it("downscales the canvas and returns a small PNG", async () => {
    const blob = new Blob([new Uint8Array(32)], { type: "image/png" });
    const mocks = stubOffscreenCanvas(blob);
    const source = document.createElement("canvas");
    source.width = 640;
    source.height = 480;

    await expect(captureThumbnail(source)).resolves.toEqual({
      ok: true,
      blob,
    });
    expect(mocks.constructor).toHaveBeenCalledWith(512, 384);
    expect(mocks.drawImage).toHaveBeenCalledWith(source, 0, 0, 512, 384);
    expect(mocks.convertToBlob).toHaveBeenCalledWith({ type: "image/png" });
  });

  it("rejects a PNG over the thumbnail byte limit", async () => {
    const blob = new Blob([new Uint8Array(THUMBNAIL_MAX_BYTES + 1)], {
      type: "image/png",
    });
    stubOffscreenCanvas(blob);

    const result = await captureThumbnail(document.createElement("canvas"));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("512 KiB");
  });

  it("reports a null conversion result", async () => {
    stubOffscreenCanvas(null);

    const result = await captureThumbnail(document.createElement("canvas"));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBeTruthy();
  });
});
