import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearSignatureSession,
  getRememberSignaturePreference,
  loadSignatureSession,
  saveSignatureSession,
} from "../signatureSession";

const DATA_KEY = "opaque.signature.session.data.v1";
const AES_KEY_KEY = "opaque.signature.session.aes.v1";
const SIGNATURE = `0x${"ab".repeat(64)}` as const;
const SESSION = {
  address: "0xABCDef0123",
  cluster: "testnet",
  message: "Sign in to Opaque",
};

function savedPayload(): { iv: string; ciphertext: string } {
  return JSON.parse(sessionStorage.getItem(DATA_KEY) ?? "null");
}

beforeEach(() => {
  sessionStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  sessionStorage.clear();
});

describe("signatureSession", () => {
  it("returns a remembered signature for the same address, cluster, and message", async () => {
    await saveSignatureSession({ signatureHex: SIGNATURE, ...SESSION, remember: true });

    await expect(loadSignatureSession(SESSION)).resolves.toBe(SIGNATURE);
  });

  it("matches the address case-insensitively", async () => {
    await saveSignatureSession({ signatureHex: SIGNATURE, ...SESSION, remember: true });

    await expect(
      loadSignatureSession({ ...SESSION, address: SESSION.address.toLowerCase() }),
    ).resolves.toBe(SIGNATURE);
  });

  it("stores ciphertext, not the signature or the session fields", async () => {
    await saveSignatureSession({ signatureHex: SIGNATURE, ...SESSION, remember: true });

    const raw = sessionStorage.getItem(DATA_KEY) ?? "";
    expect(raw).not.toContain("ab".repeat(64));
    expect(raw).not.toContain(SESSION.message);
    expect(raw).not.toContain(SESSION.cluster);
  });

  it("persists nothing and clears a previous session when remember is false", async () => {
    await saveSignatureSession({ signatureHex: SIGNATURE, ...SESSION, remember: true });
    await saveSignatureSession({ signatureHex: SIGNATURE, ...SESSION, remember: false });

    expect(sessionStorage.getItem(DATA_KEY)).toBeNull();
    expect(sessionStorage.getItem(AES_KEY_KEY)).toBeNull();
    expect(getRememberSignaturePreference()).toBe(false);
    await expect(loadSignatureSession(SESSION)).resolves.toBeNull();
  });

  it("records the remember preference", async () => {
    await saveSignatureSession({ signatureHex: SIGNATURE, ...SESSION, remember: true });

    expect(getRememberSignaturePreference()).toBe(true);
  });

  it("keeps a session valid through its ttl and rejects it one millisecond later", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(1_000_000);
    await saveSignatureSession({
      signatureHex: SIGNATURE,
      ...SESSION,
      remember: true,
      ttlMs: 1_000,
    });

    vi.setSystemTime(1_000_000 + 1_000);
    await expect(loadSignatureSession(SESSION)).resolves.toBe(SIGNATURE);

    vi.setSystemTime(1_000_000 + 1_001);
    await expect(loadSignatureSession(SESSION)).resolves.toBeNull();
    expect(sessionStorage.getItem(DATA_KEY)).toBeNull();
  });

  it.each([
    ["address", { address: "0x0000000000" }],
    ["cluster", { cluster: "mainnet" }],
    ["message", { message: "Sign in to another app" }],
  ])("rejects and clears a session bound to a different %s", async (_field, override) => {
    await saveSignatureSession({ signatureHex: SIGNATURE, ...SESSION, remember: true });

    await expect(loadSignatureSession({ ...SESSION, ...override })).resolves.toBeNull();
    expect(sessionStorage.getItem(DATA_KEY)).toBeNull();
    await expect(loadSignatureSession(SESSION)).resolves.toBeNull();
  });

  it("clears the session when the ciphertext fails to decrypt", async () => {
    await saveSignatureSession({ signatureHex: SIGNATURE, ...SESSION, remember: true });
    const payload = savedPayload();
    sessionStorage.setItem(
      DATA_KEY,
      JSON.stringify({ iv: payload.iv, ciphertext: btoa("not a real ciphertext") }),
    );

    await expect(loadSignatureSession(SESSION)).resolves.toBeNull();
    expect(sessionStorage.getItem(DATA_KEY)).toBeNull();
    expect(sessionStorage.getItem(AES_KEY_KEY)).toBeNull();
  });

  it("clears the session when the AES key has been replaced", async () => {
    await saveSignatureSession({ signatureHex: SIGNATURE, ...SESSION, remember: true });
    sessionStorage.setItem(AES_KEY_KEY, btoa(String.fromCharCode(...new Uint8Array(32).fill(7))));

    await expect(loadSignatureSession(SESSION)).resolves.toBeNull();
    expect(sessionStorage.getItem(DATA_KEY)).toBeNull();
  });

  it("treats malformed stored JSON as no session and clears it", async () => {
    await saveSignatureSession({ signatureHex: SIGNATURE, ...SESSION, remember: true });
    sessionStorage.setItem(DATA_KEY, "{not json");

    await expect(loadSignatureSession(SESSION)).resolves.toBeNull();
    expect(sessionStorage.getItem(DATA_KEY)).toBeNull();
  });

  it("returns null without touching storage when either half of the session is missing", async () => {
    await saveSignatureSession({ signatureHex: SIGNATURE, ...SESSION, remember: true });
    sessionStorage.removeItem(AES_KEY_KEY);

    await expect(loadSignatureSession(SESSION)).resolves.toBeNull();
    expect(sessionStorage.getItem(DATA_KEY)).not.toBeNull();
  });

  it("clearSignatureSession removes the data, key, and preference", async () => {
    await saveSignatureSession({ signatureHex: SIGNATURE, ...SESSION, remember: true });

    clearSignatureSession();

    expect(sessionStorage.getItem(DATA_KEY)).toBeNull();
    expect(sessionStorage.getItem(AES_KEY_KEY)).toBeNull();
    expect(getRememberSignaturePreference()).toBe(false);
  });
});
