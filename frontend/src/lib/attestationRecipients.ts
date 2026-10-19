import { sha256 } from "@noble/hashes/sha2";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils";

/** Prefix on history counterparties that hold a hashed recipient, not the recipient itself. */
export const RECIPIENT_REFERENCE_PREFIX = "rcpt:";

/**
 * Short, non-reversible label for an attestation recipient, the only form of the
 * recipient that local history keeps. The full meta-address is never stored, so a shared
 * or compromised device cannot pair the issuer's wallet with the recipient's identity.
 */
export function recipientReference(recipient: string): string {
  const normalized = recipient.trim().replace(/^0x/i, "").toLowerCase();
  return `${RECIPIENT_REFERENCE_PREFIX}${bytesToHex(sha256(utf8ToBytes(normalized))).slice(0, 12)}`;
}

export function isMetaAddressRecipient(input: string): boolean {
  const trimmed = input.trim().replace(/^0x/i, "");
  return /^[0-9a-fA-F]{132}$/.test(trimmed);
}

export function recipientDiscoveryMessage(announcementPublished: boolean): string {
  return announcementPublished
    ? "The recipient's scanner can discover this attestation on its next scan."
    : "The attestation is on chain. Tell the recipient out of band so they can look for it.";
}
