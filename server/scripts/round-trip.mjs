// Authenticated persistence round-trip against a running Compose stack.
// Proves the real SQL / transaction / bytea / auth path end to end. Seed the
// users+sessions first (see server/scripts/round-trip.seed.sql), then run:
//   API=http://127.0.0.1:3001 node server/scripts/round-trip.mjs
// Exits non-zero on the first failed assertion.
import { createHmac } from "node:crypto";
import { PNG } from "pngjs";

const API = process.env.API ?? "http://127.0.0.1:3001";
const SECRET = process.env.BETTER_AUTH_SECRET ?? "0123456789abcdef0123456789abcdef";
const TRUSTED_ORIGIN = process.env.TRUSTED_ORIGIN ?? "http://localhost:5173";
const TOKEN_A = process.env.TOKEN_A ?? "roundtrip-token-alice-0001";
const TOKEN_B = process.env.TOKEN_B ?? "roundtrip-token-bob-0001";

let failures = 0;
function check(label, cond) {
  const status = cond ? "PASS" : "FAIL";
  if (!cond) failures += 1;
  console.log(`  [${status}] ${label}`);
}
function bytesEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

// Better Auth signed session cookie: encodeURIComponent(token + "." + base64(HMAC-SHA256(secret, token)))
function cookieFor(token) {
  const sig = createHmac("sha256", SECRET).update(token).digest("base64");
  return `better-auth.session_token=${encodeURIComponent(`${token}.${sig}`)}`;
}

function makePng(width, height, seed) {
  const png = new PNG({ width, height });
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = (seed * 37 + i) & 0xff;
    png.data[i + 1] = (seed * 53 + i * 3) & 0xff;
    png.data[i + 2] = (seed * 97 + i * 7) & 0xff;
    png.data[i + 3] = 0xff;
  }
  return PNG.sync.write(png);
}

async function main() {
  const cookieA = cookieFor(TOKEN_A);
  const cookieB = cookieFor(TOKEN_B);

  const pngA = makePng(32, 32, 1);
  const pngB = makePng(16, 16, 2);
  const thumb = makePng(512, 384, 3);

  const source = "Texture grass = { 32, 32, RGBA16 }\nTexture mask = { 16, 16, IA8 }\n";
  const baseManifest = {
    description: "round-trip",
    source,
    schemaVersion: 1,
    microcode: "F3DEX2",
    textures: [
      { name: "grass", part: "p_grass" },
      { name: "mask", part: "p_mask" },
    ],
    thumbnailPart: "thumb",
  };

  console.log("== create public toy (2 textures + thumbnail) ==");
  const createBody = new FormData();
  createBody.append(
    "manifest",
    JSON.stringify({ ...baseManifest, title: "Round Trip", visibility: "public" }),
  );
  createBody.append("p_grass", new Blob([pngA], { type: "image/png" }), "grass.png");
  createBody.append("p_mask", new Blob([pngB], { type: "image/png" }), "mask.png");
  createBody.append("thumb", new Blob([thumb], { type: "image/png" }), "thumb.png");
  const created = await fetch(`${API}/api/toys`, {
    method: "POST",
    headers: { Cookie: cookieA, Origin: TRUSTED_ORIGIN },
    body: createBody,
  });
  check(`create -> 201 (got ${created.status})`, created.status === 201);
  const { slug } = await created.json();
  check("create returned a slug", typeof slug === "string" && slug.length > 0);

  console.log("== get owned toy ==");
  const detail = await fetch(`${API}/api/toys/${slug}`, { headers: { Cookie: cookieA } });
  check(`get -> 200 (got ${detail.status})`, detail.status === 200);
  const toy = await detail.json();
  check("isOwner true for owner", toy.isOwner === true);
  check("two textures returned", Array.isArray(toy.textures) && toy.textures.length === 2);
  check("visibility public", toy.visibility === "public");
  check("owner has no email field", toy.owner && toy.owner.email === undefined);
  check("thumbnailUrl present", typeof toy.thumbnailUrl === "string");

  console.log("== byte-exact asset round-trip ==");
  const grassRes = await fetch(`${API}/api/toys/${slug}/textures/grass`, { headers: { Cookie: cookieA } });
  const grassBytes = new Uint8Array(await grassRes.arrayBuffer());
  check("grass texture bytes byte-for-byte identical", bytesEqual(grassBytes, pngA));
  check("grass content-type image/png", grassRes.headers.get("content-type") === "image/png");
  const maskRes = await fetch(`${API}/api/toys/${slug}/textures/mask`, { headers: { Cookie: cookieA } });
  check("mask texture bytes identical", bytesEqual(new Uint8Array(await maskRes.arrayBuffer()), pngB));
  const thumbRes = await fetch(`${API}/api/toys/${slug}/thumbnail`, { headers: { Cookie: cookieA } });
  check("thumbnail bytes identical", bytesEqual(new Uint8Array(await thumbRes.arrayBuffer()), thumb));

  console.log("== update: remove 'mask', omit thumbnail (full replacement) ==");
  const updBody = new FormData();
  updBody.append(
    "manifest",
    JSON.stringify({
      ...baseManifest,
      title: "Round Trip v2",
      visibility: "private",
      source: "Texture grass = { 32, 32, RGBA16 }\n",
      textures: [{ name: "grass", part: "p_grass" }],
      thumbnailPart: undefined,
    }),
  );
  updBody.append("p_grass", new Blob([pngA], { type: "image/png" }), "grass.png");
  const updated = await fetch(`${API}/api/toys/${slug}`, {
    method: "PUT",
    headers: { Cookie: cookieA, Origin: TRUSTED_ORIGIN },
    body: updBody,
  });
  check(`update -> 200 (got ${updated.status})`, updated.status === 200);
  const maskGone = await fetch(`${API}/api/toys/${slug}/textures/mask`, { headers: { Cookie: cookieA } });
  check("removed texture 'mask' now 404", maskGone.status === 404);
  const thumbGone = await fetch(`${API}/api/toys/${slug}/thumbnail`, { headers: { Cookie: cookieA } });
  check("omitted thumbnail now 404 (full replacement)", thumbGone.status === 404);

  console.log("== private authorization ==");
  const asOther = await fetch(`${API}/api/toys/${slug}`, { headers: { Cookie: cookieB } });
  check("private toy -> 404 for a different user", asOther.status === 404);
  const asAnon = await fetch(`${API}/api/toys/${slug}`);
  check("private toy -> 404 anonymous", asAnon.status === 404);
  const asOwner = await fetch(`${API}/api/toys/${slug}`, { headers: { Cookie: cookieA } });
  check("private toy -> 200 for owner", asOwner.status === 200);
  const otherTexture = await fetch(`${API}/api/toys/${slug}/textures/grass`, { headers: { Cookie: cookieB } });
  check("private texture -> 404 for a different user", otherTexture.status === 404);

  console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("round-trip crashed:", error);
  process.exit(1);
});
