import { randomBytes } from "node:crypto";

const CROCKFORD_BASE32 = "0123456789abcdefghjkmnpqrstvwxyz";

export function generateSlug(): string {
  const bytes = randomBytes(16);

  return Array.from(
    bytes,
    (byte) => CROCKFORD_BASE32[byte & 0x1f],
  ).join("");
}
