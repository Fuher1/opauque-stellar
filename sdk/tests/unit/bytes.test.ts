import { describe, expect, it } from "vitest";
import { hexToBytes } from "../../src/crypto/bytes";

describe("hexToBytes", () => {
  it("decodes prefixed and unprefixed hex", () => {
    expect(Array.from(hexToBytes("0x00aF"))).toEqual([0, 175]);
    expect(Array.from(hexToBytes("00aF"))).toEqual([0, 175]);
  });

  it("rejects odd lengths and non-hex characters", () => {
    expect(() => hexToBytes("abc")).toThrow("Invalid hex length");
    expect(() => hexToBytes("0x0g")).toThrow("Invalid hex characters");
    expect(() => hexToBytes("zz")).toThrow("Invalid hex characters");
  });
});
