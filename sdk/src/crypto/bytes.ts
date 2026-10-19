/**
 * Byte and hex helpers shared across the crypto layer.
 *
 * These are intentionally dependency-free and isomorphic (Node + browser).
 */

/** Parse a hex string (with or without `0x`) into bytes. */
export function hexToBytes(hex: string): Uint8Array {
  const h = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (h.length % 2) throw new Error("Invalid hex length");
  if (!/^[0-9a-fA-F]*$/.test(h)) throw new Error("Invalid hex characters");
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/** Encode bytes as a lowercase hex string (no `0x` prefix). */
export function bytesToHex(b: Uint8Array): string {
  return Array.from(b)
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}

/** Interpret bytes as a big-endian unsigned integer. */
export function bytesToBigInt(b: Uint8Array): bigint {
  let x = 0n;
  for (let i = 0; i < b.length; i++) x = (x << 8n) | BigInt(b[i]);
  return x;
}

/** Encode a bigint as a fixed 32-byte big-endian array. */
export function bigIntToBytes32(value: bigint): Uint8Array {
  const out = new Uint8Array(32);
  let x = value;
  for (let i = 31; i >= 0; i--) {
    out[i] = Number(x & 0xffn);
    x >>= 8n;
  }
  return out;
}

/** bigint -> 0x-prefixed 32-byte big-endian hex. */
export function toHex32(v: bigint): string {
  return "0x" + v.toString(16).padStart(64, "0");
}

/** Concatenate byte arrays into one. */
export function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrays) {
    out.set(a, off);
    off += a.length;
  }
  return out;
}
