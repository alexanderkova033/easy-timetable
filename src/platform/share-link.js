/** Compress app JSON for #sync= URL sharing (gzip when supported). */

const PREFIX = "sync1.";

export const SHARE_HASH_PREFIX = "sync=";

export function supportsShareLinkCompression() {
  return typeof CompressionStream !== "undefined" && typeof DecompressionStream !== "undefined";
}

function bytesToBase64Url(u8) {
  let bin = "";
  for (let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]);
  const b64 = btoa(bin);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(s) {
  let b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  while (b64.length % 4) b64 += "=";
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** @param {string} jsonString */
export async function encodeAppStatePayload(jsonString) {
  const enc = new TextEncoder().encode(jsonString);
  if (!supportsShareLinkCompression()) {
    return PREFIX + bytesToBase64Url(enc);
  }
  const compressed = new Blob([enc]).stream().pipeThrough(new CompressionStream("gzip"));
  const buf = await new Response(compressed).arrayBuffer();
  return PREFIX + bytesToBase64Url(new Uint8Array(buf));
}

/** @param {string} payload after optional PREFIX */
export async function decodeAppStatePayload(payload) {
  const raw = payload.startsWith(PREFIX) ? payload.slice(PREFIX.length) : payload;
  const bytes = base64UrlToBytes(raw);
  if (!supportsShareLinkCompression()) {
    return new TextDecoder().decode(bytes);
  }
  try {
    const decompressed = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
    const out = await new Response(decompressed).arrayBuffer();
    return new TextDecoder().decode(out);
  } catch {
    return new TextDecoder().decode(bytes);
  }
}

export const MAX_SHARE_URL_CHARS = 48000;
