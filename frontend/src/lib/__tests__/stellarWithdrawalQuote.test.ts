import { beforeEach, describe, expect, it, vi } from "vitest";
import { Keypair } from "@stellar/stellar-sdk";
import { getNativeWithdrawalQuote } from "../stellar";

const horizon = vi.hoisted(() => ({
  loadAccount: vi.fn(),
  ledgerRecord: {} as Record<string, unknown>,
}));

vi.mock("@stellar/stellar-sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@stellar/stellar-sdk")>();
  class FakeHorizonServer {
    loadAccount(publicKey: string) {
      return horizon.loadAccount(publicKey);
    }
    ledgers() {
      const query = {
        order: () => query,
        limit: () => query,
        call: async () => ({ records: [horizon.ledgerRecord] }),
      };
      return query;
    }
  }
  return { ...actual, Horizon: { ...actual.Horizon, Server: FakeHorizonServer } };
});

vi.mock("../chain", () => ({
  getHorizonUrls: () => ["https://horizon.test"],
  getRpcUrls: () => ["https://rpc.test"],
  getNetworkPassphrase: () => "Test SDF Network ; September 2015",
}));

vi.mock("../monitoring", () => ({ recordContractCall: vi.fn(), recordRpcError: vi.fn() }));

const SOURCE = Keypair.random().publicKey();
const DESTINATION = Keypair.random().publicKey();

const DEFAULT_LEDGER = { base_fee_in_stroops: "100", base_reserve_in_stroops: "5000000" };

type SourceShape = {
  balance?: string | null;
  subentry_count?: number;
  num_sponsoring?: number;
  num_sponsored?: number;
};

function arrange({
  source = {},
  destinationExists,
  ledger = DEFAULT_LEDGER,
  destinationError = { response: { status: 404 } },
}: {
  source?: SourceShape;
  destinationExists: boolean;
  ledger?: Record<string, unknown>;
  destinationError?: object;
}) {
  const { balance = "100.0000000", ...counts } = source;
  const account = {
    balances: balance === null ? [] : [{ asset_type: "native", balance }],
    ...counts,
  };
  horizon.ledgerRecord = ledger;
  horizon.loadAccount.mockImplementation(async (publicKey: string) => {
    if (publicKey === SOURCE) return account;
    if (publicKey === DESTINATION && destinationExists) return {};
    throw Object.assign(new Error("request failed"), destinationError);
  });
}

function quote() {
  return getNativeWithdrawalQuote({ sourcePublicKey: SOURCE, destination: DESTINATION });
}

beforeEach(() => {
  horizon.loadAccount.mockReset();
});

describe("getNativeWithdrawalQuote reserve math", () => {
  it("keeps two base reserves plus the fee from an existing destination", async () => {
    arrange({ destinationExists: true });

    await expect(quote()).resolves.toEqual({
      balanceStroops: 1_000_000_000n,
      feeStroops: 100n,
      minimumBalanceStroops: 10_000_000n,
      spendableStroops: 989_999_900n,
      destinationExists: true,
      operation: "payment",
    });
  });

  it("adds one reserve per subentry and nets out sponsorship", async () => {
    arrange({
      source: { subentry_count: 3, num_sponsoring: 1, num_sponsored: 2 },
      destinationExists: true,
    });

    const result = await quote();

    // 2 + 3 + 1 - 2 = 4 reserve units at 5 XLM-stroops each.
    expect(result.minimumBalanceStroops).toBe(20_000_000n);
    expect(result.spendableStroops).toBe(979_999_900n);
  });

  it("clamps the reserve at zero when sponsored reserves exceed the owned ones", async () => {
    arrange({ source: { num_sponsored: 5 }, destinationExists: true });

    const result = await quote();

    // 2 - 5 is negative; only the fee is retained.
    expect(result.minimumBalanceStroops).toBe(0n);
    expect(result.spendableStroops).toBe(999_999_900n);
  });

  it("returns zero spendable when the balance does not cover reserve plus fee", async () => {
    arrange({ source: { balance: "0.0000050" }, destinationExists: true });

    const result = await quote();

    expect(result.balanceStroops).toBe(50n);
    expect(result.spendableStroops).toBe(0n);
  });

  it("reports a zero balance when no native balance is listed", async () => {
    arrange({ source: { balance: null }, destinationExists: true });

    const result = await quote();

    expect(result.balanceStroops).toBe(0n);
    expect(result.spendableStroops).toBe(0n);
  });

  it("uses the fee and base reserve Horizon reports for the ledger", async () => {
    arrange({
      destinationExists: true,
      ledger: { base_fee_in_stroops: "200", base_reserve_in_stroops: "1000000" },
    });

    const result = await quote();

    expect(result.feeStroops).toBe(200n);
    expect(result.minimumBalanceStroops).toBe(2_000_000n);
    // 1_000_000_000 - (2_000_000 + 200)
    expect(result.spendableStroops).toBe(997_999_800n);
  });

  it("falls back to protocol defaults when the ledger record is empty", async () => {
    arrange({ destinationExists: true, ledger: {} });

    const result = await quote();

    expect(result.feeStroops).toBe(100n);
    expect(result.minimumBalanceStroops).toBe(10_000_000n);
  });

  it("does not apply the new-account minimum to an existing destination", async () => {
    // Available after reserve and fee: 5_000_000 stroops, below the 1 XLM new-account minimum.
    arrange({ source: { balance: "1.5000100" }, destinationExists: true });

    const result = await quote();

    expect(result.spendableStroops).toBe(5_000_000n);
    expect(result.operation).toBe("payment");
  });
});

describe("getNativeWithdrawalQuote new destinations", () => {
  it("uses createAccount and spends everything available when it clears the 1 XLM minimum", async () => {
    arrange({ destinationExists: false });

    await expect(quote()).resolves.toEqual({
      balanceStroops: 1_000_000_000n,
      feeStroops: 100n,
      minimumBalanceStroops: 10_000_000n,
      spendableStroops: 989_999_900n,
      destinationExists: false,
      operation: "createAccount",
    });
  });

  it("reports zero spendable when available is below the 1 XLM minimum", async () => {
    // Available after reserve and fee: 5_000_000 stroops.
    arrange({ source: { balance: "1.5000100" }, destinationExists: false });

    const result = await quote();

    expect(result.spendableStroops).toBe(0n);
    expect(result.operation).toBe("createAccount");
  });

  it("accepts available exactly equal to the 1 XLM minimum", async () => {
    // Available after reserve and fee: 10_000_000 stroops.
    arrange({ source: { balance: "2.0000100" }, destinationExists: false });

    const result = await quote();

    expect(result.spendableStroops).toBe(10_000_000n);
    expect(result.operation).toBe("createAccount");
  });

  it("does not treat an unknown destination as new when the lookup fails", async () => {
    arrange({ destinationExists: false, destinationError: { response: { status: 400 } } });

    await expect(quote()).rejects.toThrow();
  });
});
