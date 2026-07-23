import { PNG } from "pngjs";

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
const IHDR = [73, 72, 68, 82];

export function readPngHeader(
  bytes: Uint8Array,
): { width: number; height: number } | null {
  if (bytes.byteLength < 24) {
    return null;
  }

  if (!PNG_SIGNATURE.every((byte, index) => bytes[index] === byte)) {
    return null;
  }

  if (!IHDR.every((byte, index) => bytes[index + 12] === byte)) {
    return null;
  }

  const view = new DataView(
    bytes.buffer,
    bytes.byteOffset,
    bytes.byteLength,
  );
  const width = view.getUint32(16);
  const height = view.getUint32(20);

  return width === 0 || height === 0 ? null : { width, height };
}

export function decodePng(
  bytes: Uint8Array,
): { width: number; height: number } | { error: string } {
  try {
    const png = PNG.sync.read(Buffer.from(bytes));
    return { width: png.width, height: png.height };
  } catch (error) {
    return { error: String(error) };
  }
}
