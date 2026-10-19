import { useContext, useLayoutEffect, useMemo, useRef } from "react";
import { StellarWalletContext } from "../context/StellarWalletProviders";
import { getNetwork } from "../lib/chain";
import { getHorizonServer } from "../lib/stellar";

export function useWallet() {
  const ctx = useContext(StellarWalletContext);
  if (!ctx) {
    throw new Error("useWallet must be used within StellarWalletProviders");
  }

  const {
    publicKey,
    connected,
    connecting,
    connect,
    disconnect,
    signTransaction,
    signMessage,
    connectionError,
  } = ctx;

  const network = getNetwork();
  const publicKeyRef = useRef(publicKey);
  const signMessageRef = useRef(signMessage);

  useLayoutEffect(() => {
    publicKeyRef.current = publicKey;
    signMessageRef.current = signMessage;
  }, [publicKey, signMessage]);

  const state = useMemo(
    () => ({
      isConnected: connected,
      address: publicKey,
      publicKey,
      cluster: network,
      network,
      isConnecting: connecting,
      connecting,
      error: null as string | null,
    }),
    [connected, publicKey, network, connecting],
  );

  const connection = useMemo(
    () => ({
      getBalance: async (address: string) => {
        const account = await getHorizonServer().loadAccount(address);
        const native = account.balances.find((b) => b.asset_type === "native");
        return BigInt(
          Math.round(parseFloat((native as { balance: string })?.balance ?? "0") * 1e7),
        );
      },
      getSlot: async () => {
        const ledgers = await getHorizonServer().ledgers().order("desc").limit(1).call();
        const latest = ledgers.records[0];
        return latest ? Number(latest.sequence) : 0;
      },
    }),
    [],
  );

  return {
    ...state,
    connected,
    connect,
    disconnect,
    connection,
    signMessage,
    signTransaction,
    sendTransaction: signTransaction,
    publicKeyRef,
    signMessageRef,
    // This app only supports one wallet (Freighter); this array exists so
    // callers can gate on "is a wallet available" before calling
    // connect(). It was previously hardcoded to `[]`, which made the
    // `wallets.length === 0` check always throw "Connect Freighter to
    // continue." before ever attempting to connect, regardless of whether
    // Freighter was actually installed. `connect()` itself still surfaces a
    // real error if Freighter truly isn't present.
    wallets: ["freighter"] as const,
    wallet: null,
    select: () => {},
    connectionError,
  };
}
