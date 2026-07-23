const THUMBNAIL_WIDTH = 512;
const THUMBNAIL_HEIGHT = 384;
const THUMBNAIL_MAX_BYTES = 512 * 1024;

export type ThumbnailCaptureResult =
  | { ok: true; blob: Blob }
  | { ok: false; reason: string };

export async function captureThumbnail(
  source: HTMLCanvasElement,
): Promise<ThumbnailCaptureResult> {
  try {
    const canvas = new OffscreenCanvas(THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT);
    const context = canvas.getContext("2d");
    if (!context) {
      return { ok: false, reason: "thumbnail canvas is unavailable" };
    }
    context.drawImage(source, 0, 0, THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT);
    const blob = await canvas.convertToBlob({ type: "image/png" });
    if (!blob) {
      return { ok: false, reason: "thumbnail PNG conversion failed" };
    }
    if (blob.size > THUMBNAIL_MAX_BYTES) {
      return { ok: false, reason: "thumbnail PNG exceeds 512 KiB" };
    }
    return { ok: true, blob };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      reason: reason || "thumbnail PNG conversion failed",
    };
  }
}
