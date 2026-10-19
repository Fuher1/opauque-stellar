import { afterEach, describe, expect, it, vi } from "vitest";
import { Keypair, StrKey } from "@stellar/stellar-sdk";
import {
  bytesToHex,
  hashPoolWithdrawPayload,
  RELAY_CHAIN_STELLAR,
} from "@opaquecash/stellar/relayer-protocol";
import {
  buildRelayedWithdrawPayload,
  buildRelayerJobDraft,
  pickStakeWeightedBid,
  type VerifiedBid,
} from "../relayerMarket";
import type { WithdrawProof } from "../poolProver";

vi.mock("../../contracts/relayerConfig", () => ({ getRelayerConfig: vi.fn(() => null) }));
vi.mock("../chain", () => ({
  getNetworkPassphrase: vi.fn(() => "Test SDF Network ; September 2015"),
}));
vi.mock("../stellar", () => ({ bytesToScVal: vi.fn(), getSorobanServer: vi.fn() }));

function bytes(length: number, fill: number): Uint8Array {
  return new Uint8Array(length).fill(fill);
}

// The payload hash parses every address, so these must be valid strkeys.
const POOL_ID = StrKey.encodeContract(Buffer.from(bytes(32, 0x10)));
const REGISTRY_ID = StrKey.encodeContract(Buffer.from(bytes(32, 0x20)));
const RECIPIENT = Keypair.random().publicKey();
const OTHER_RECIPIENT = Keypair.random().publicKey();
const BOUND_RELAYER = Keypair.random().publicKey();

const PROOF: WithdrawProof = {
  proofA: bytes(64, 1),
  proofB: bytes(128, 2),
  proofC: bytes(64, 3),
  withdrawnValue: 1_000_000n,
  stateRoot: bytes(32, 4),
  aspRoot: bytes(32, 5),
  nullifierHash: bytes(32, 6),
  newCommitment: bytes(32, 7),
};

function makeBid(operator: string, freeStakeValue: bigint): VerifiedBid {
  return {
    t: "bid",
    v: 1,
    jobId: "00".repeat(32),
    chain: RELAY_CHAIN_STELLAR,
    operator,
    x25519Pk: "11".repeat(32),
    sig: "22".repeat(64),
    endpoint: `https://${operator.toLowerCase()}.relayer.test`,
    freeStake: freeStakeValue.toString(),
    freeStakeValue,
  };
}

/** Make the next `crypto.getRandomValues` call fill the 64-bit draw with `hi` and `lo`. */
function stubRandomWords(hi: number, lo: number) {
  return vi.spyOn(globalThis.crypto, "getRandomValues").mockImplementation(((array: Uint32Array) => {
    array[0] = hi;
    array[1] = lo;
    return array;
  }) as unknown as typeof globalThis.crypto.getRandomValues);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("buildRelayedWithdrawPayload", () => {
  it("copies the proof and recipient into a zero-fee payload", () => {
    const payload = buildRelayedWithdrawPayload({
      poolId: POOL_ID,
      registryId: REGISTRY_ID,
      proof: PROOF,
      recipient: RECIPIENT,
      boundRelayer: BOUND_RELAYER,
    });

    expect(payload).toEqual({
      poolId: POOL_ID,
      proofA: PROOF.proofA,
      proofB: PROOF.proofB,
      proofC: PROOF.proofC,
      withdrawnValue: 1_000_000n,
      stateRoot: PROOF.stateRoot,
      aspRoot: PROOF.aspRoot,
      nullifierHash: PROOF.nullifierHash,
      newCommitment: PROOF.newCommitment,
      recipient: RECIPIENT,
      poolFee: 0n,
      poolRelayer: BOUND_RELAYER,
    });
  });

  it("binds the pool relayer to the registry address when no relayer was picked up front", () => {
    const payload = buildRelayedWithdrawPayload({
      poolId: POOL_ID,
      registryId: REGISTRY_ID,
      proof: PROOF,
      recipient: RECIPIENT,
    });

    expect(payload.poolRelayer).toBe(REGISTRY_ID);
  });
});

describe("buildRelayerJobDraft", () => {
  const payload = buildRelayedWithdrawPayload({
    poolId: POOL_ID,
    registryId: REGISTRY_ID,
    proof: PROOF,
    recipient: RECIPIENT,
    boundRelayer: BOUND_RELAYER,
  });

  it("builds an advert from the supplied job id, fee, deadline, and payload hash", () => {
    const jobId = bytes(32, 0xaa);
    const draft = buildRelayerJobDraft({
      payload,
      fee: 2_500_000n,
      deadlineLedger: 12_345,
      jobId,
    });

    expect(draft.jobId).toEqual(jobId);
    expect(draft.jobIdHex).toBe(bytesToHex(jobId));
    expect(draft.payloadHash).toEqual(hashPoolWithdrawPayload(payload));
    expect(draft.payloadHashHex).toBe(bytesToHex(draft.payloadHash));
    expect(draft.fee).toBe(2_500_000n);
    expect(draft.deadlineLedger).toBe(12_345);
    expect(draft.payload).toBe(payload);
    expect(draft.advert).toEqual({
      t: "advert",
      v: 1,
      jobId: draft.jobIdHex,
      chain: RELAY_CHAIN_STELLAR,
      fee: "2500000",
      deadline: 12_345,
      payloadHash: draft.payloadHashHex,
    });
  });

  it("changes the payload hash when the payload changes", () => {
    const other = buildRelayedWithdrawPayload({
      poolId: POOL_ID,
      registryId: REGISTRY_ID,
      proof: PROOF,
      recipient: OTHER_RECIPIENT,
      boundRelayer: BOUND_RELAYER,
    });
    const base = { fee: 1n, deadlineLedger: 1, jobId: bytes(32, 1) };

    const a = buildRelayerJobDraft({ ...base, payload });
    const b = buildRelayerJobDraft({ ...base, payload: other });

    expect(a.payloadHashHex).not.toBe(b.payloadHashHex);
  });

  it("generates a 32-byte job id when none is supplied", () => {
    const draft = buildRelayerJobDraft({ payload, fee: 1n, deadlineLedger: 1 });

    expect(draft.jobId).toHaveLength(32);
    expect(draft.jobIdHex).toHaveLength(64);
    expect(draft.advert.jobId).toBe(draft.jobIdHex);
  });

  it("rejects a job id that is not 32 bytes", () => {
    expect(() =>
      buildRelayerJobDraft({ payload, fee: 1n, deadlineLedger: 1, jobId: bytes(31, 1) }),
    ).toThrow();
  });
});

describe("pickStakeWeightedBid", () => {
  it("returns null when there are no bids", () => {
    expect(pickStakeWeightedBid([])).toBeNull();
  });

  it("returns the only bid without drawing randomness", () => {
    const random = vi.spyOn(globalThis.crypto, "getRandomValues");
    const only = makeBid("GONLY", 500n);

    expect(pickStakeWeightedBid([only])).toBe(only);
    expect(random).not.toHaveBeenCalled();
  });

  it("falls back to the first bid when every bid has zero stake", () => {
    const first = makeBid("GFIRST", 0n);
    const second = makeBid("GSECOND", 0n);

    expect(pickStakeWeightedBid([first, second])).toBe(first);
  });

  it("selects by stake weight: the draw lands in the bid's slice of the total", () => {
    // Stakes 100 and 300, total 400. The draw is taken modulo the total.
    const light = makeBid("GLIGHT", 100n);
    const heavy = makeBid("GHEAVY", 300n);
    const bids = [light, heavy];

    stubRandomWords(0, 0);
    expect(pickStakeWeightedBid(bids)).toBe(light);

    stubRandomWords(0, 99);
    expect(pickStakeWeightedBid(bids)).toBe(light);

    stubRandomWords(0, 100);
    expect(pickStakeWeightedBid(bids)).toBe(heavy);

    stubRandomWords(0, 399);
    expect(pickStakeWeightedBid(bids)).toBe(heavy);
  });

  it("combines both 32-bit words into the draw", () => {
    // 2^32 mod 400 = 96, which falls inside the first bid's slice (0..99).
    const light = makeBid("GLIGHT", 100n);
    const heavy = makeBid("GHEAVY", 300n);

    stubRandomWords(1, 0);
    expect(pickStakeWeightedBid([light, heavy])).toBe(light);
  });

  it("skips bids with zero stake when drawing", () => {
    const empty = makeBid("GEMPTY", 0n);
    const funded = makeBid("GFUNDED", 50n);

    stubRandomWords(0, 0);
    expect(pickStakeWeightedBid([empty, funded])).toBe(funded);
  });
});
