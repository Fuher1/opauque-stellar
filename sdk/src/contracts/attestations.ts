/**
 * Bindings for the schema-registry and attestation-engine-v2 contracts:
 * register / deprecate schemas, manage delegates, attest, and revoke.
 */
import { StrKey, nativeToScVal } from "@stellar/stellar-sdk";
import type { ContractInvoker } from "../rpc/client";
import type { OpaqueSigner } from "../signer/index";
import {
  addressToScVal,
  boolToScVal,
  bytesToScVal,
  optionAddressToScVal,
  stringToScVal,
  u32ToScVal,
} from "../rpc/scval";

export interface SchemaRecord {
  schemaId: Uint8Array;
  authority: string;
  resolver: string;
  revocable: boolean;
  name: string;
  fieldDefinitions: string;
  version: number;
  createdAt: number;
  schemaExpiryLedger: number;
  deprecated: boolean;
}

export interface AttestationRecord {
  uid: Uint8Array;
  schemaId: Uint8Array;
  issuer: string;
  stealthAddressHash: Uint8Array;
  data: Uint8Array;
  createdAt: number;
  expirationLedger: number;
  revocationLedger: number;
  refUid: Uint8Array;
  issuanceSequence: bigint;
}

function field<T>(raw: Record<string, unknown>, snake: string, camel: string): T {
  return (raw[snake] ?? raw[camel]) as T;
}

function bytes(value: unknown): Uint8Array {
  return value instanceof Uint8Array ? value : Uint8Array.from(value as number[]);
}

function schemaRecord(raw: Record<string, unknown>): SchemaRecord {
  return {
    schemaId: bytes(field(raw, "schema_id", "schemaId")),
    authority: String(raw.authority), resolver: String(raw.resolver),
    revocable: Boolean(raw.revocable), name: String(raw.name),
    fieldDefinitions: String(field(raw, "field_definitions", "fieldDefinitions")),
    version: Number(raw.version), createdAt: Number(field(raw, "created_at", "createdAt")),
    schemaExpiryLedger: Number(field(raw, "schema_expiry_ledger", "schemaExpiryLedger")),
    deprecated: Boolean(raw.deprecated),
  };
}

function attestationRecord(raw: Record<string, unknown>): AttestationRecord {
  return {
    uid: bytes(raw.uid), schemaId: bytes(field(raw, "schema_id", "schemaId")),
    issuer: String(raw.issuer),
    stealthAddressHash: bytes(field(raw, "stealth_address_hash", "stealthAddressHash")),
    data: bytes(raw.data), createdAt: Number(field(raw, "created_at", "createdAt")),
    expirationLedger: Number(field(raw, "expiration_ledger", "expirationLedger")),
    revocationLedger: Number(field(raw, "revocation_ledger", "revocationLedger")),
    refUid: bytes(field(raw, "ref_uid", "refUid")),
    issuanceSequence: BigInt(field(raw, "issuance_sequence", "issuanceSequence")),
  };
}

export class SchemaRegistry {
  constructor(
    private readonly rpc: ContractInvoker,
    readonly contractId: string,
  ) {}

  /** Read the deployed contract interface version. */
  async version(source: string): Promise<number> {
    return Number(
      await this.rpc.readNative<number>({
        source,
        contractId: this.contractId,
        method: "version",
        args: [],
      }),
    );
  }

  async getSchema(source: string, schemaId: Uint8Array): Promise<SchemaRecord> {
    const raw = await this.rpc.readNative<Record<string, unknown>>({ source, contractId: this.contractId, method: "get_schema", args: [bytesToScVal(schemaId)] });
    return schemaRecord(raw);
  }

  async canIssue(source: string, schemaId: Uint8Array, issuer: string): Promise<boolean> {
    return Boolean(await this.rpc.readNative({ source, contractId: this.contractId, method: "can_issue", args: [bytesToScVal(schemaId), addressToScVal(issuer)] }));
  }

  async isAuthorizedIssuer(source: string, schemaId: Uint8Array, issuer: string): Promise<boolean> {
    return Boolean(await this.rpc.readNative({ source, contractId: this.contractId, method: "is_authorized_issuer", args: [bytesToScVal(schemaId), addressToScVal(issuer)] }));
  }

  async isRevocable(source: string, schemaId: Uint8Array): Promise<boolean> {
    return Boolean(await this.rpc.readNative({ source, contractId: this.contractId, method: "is_revocable", args: [bytesToScVal(schemaId)] }));
  }

  /** Register a schema. The signer is the schema authority. */
  async registerSchema(opts: {
    schemaId: Uint8Array;
    name: string;
    fieldDefinitions: string;
    revocable: boolean;
    version?: number;
    resolver?: string | null;
    schemaExpiryLedger: number;
    signer: OpaqueSigner;
  }): Promise<string> {
    const authority = await opts.signer.publicKey();
    const authorityKey = StrKey.decodeEd25519PublicKey(authority);
    return this.rpc.invoke({
      source: authority,
      contractId: this.contractId,
      method: "register_schema",
      contractPackage: "schema-registry",
      args: [
        addressToScVal(authority),
        nativeToScVal(Buffer.from(authorityKey), { type: "bytes" }),
        bytesToScVal(opts.schemaId),
        stringToScVal(opts.name),
        stringToScVal(opts.fieldDefinitions),
        boolToScVal(opts.revocable),
        u32ToScVal(opts.version ?? 1),
        optionAddressToScVal(opts.resolver ?? null),
        u32ToScVal(opts.schemaExpiryLedger),
      ],
      signer: opts.signer,
    });
  }

  async deprecateSchema(opts: {
    schemaId: Uint8Array;
    signer: OpaqueSigner;
  }): Promise<string> {
    const authority = await opts.signer.publicKey();
    return this.rpc.invoke({
      source: authority,
      contractId: this.contractId,
      method: "deprecate_schema",
      contractPackage: "schema-registry",
      args: [addressToScVal(authority), bytesToScVal(opts.schemaId)],
      signer: opts.signer,
    });
  }

  async addDelegate(opts: {
    schemaId: Uint8Array;
    delegate: string;
    signer: OpaqueSigner;
  }): Promise<string> {
    this.assertDelegate(opts.delegate);
    const authority = await opts.signer.publicKey();
    return this.rpc.invoke({
      source: authority,
      contractId: this.contractId,
      method: "add_delegate",
      contractPackage: "schema-registry",
      args: [
        addressToScVal(authority),
        bytesToScVal(opts.schemaId),
        addressToScVal(opts.delegate),
      ],
      signer: opts.signer,
    });
  }

  async removeDelegate(opts: {
    schemaId: Uint8Array;
    delegate: string;
    signer: OpaqueSigner;
  }): Promise<string> {
    this.assertDelegate(opts.delegate);
    const authority = await opts.signer.publicKey();
    return this.rpc.invoke({
      source: authority,
      contractId: this.contractId,
      method: "remove_delegate",
      contractPackage: "schema-registry",
      args: [
        addressToScVal(authority),
        bytesToScVal(opts.schemaId),
        addressToScVal(opts.delegate),
      ],
      signer: opts.signer,
    });
  }

  private assertDelegate(delegate: string): void {
    if (!StrKey.isValidEd25519PublicKey(delegate)) {
      throw new Error("Delegate must be a valid Stellar account address (G...).");
    }
  }
}

export class AttestationEngine {
  constructor(
    private readonly rpc: ContractInvoker,
    readonly contractId: string,
  ) {}

  /** Read the deployed contract interface version. */
  async version(source: string): Promise<number> {
    return Number(
      await this.rpc.readNative<number>({
        source,
        contractId: this.contractId,
        method: "version",
        args: [],
      }),
    );
  }

  async getAttestation(source: string, uid: Uint8Array): Promise<AttestationRecord> {
    const raw = await this.rpc.readNative<Record<string, unknown>>({ source, contractId: this.contractId, method: "get_attestation", args: [bytesToScVal(uid)] });
    return attestationRecord(raw);
  }

  async canIssue(source: string, schemaId: Uint8Array, issuer: string): Promise<boolean> {
    return Boolean(await this.rpc.readNative({ source, contractId: this.contractId, method: "can_issue", args: [bytesToScVal(schemaId), addressToScVal(issuer)] }));
  }

  async isAuthorizedIssuer(source: string, schemaId: Uint8Array, issuer: string): Promise<boolean> {
    return Boolean(await this.rpc.readNative({ source, contractId: this.contractId, method: "is_authorized_issuer", args: [bytesToScVal(schemaId), addressToScVal(issuer)] }));
  }

  async isRevocable(source: string, schemaId: Uint8Array): Promise<boolean> {
    return Boolean(await this.rpc.readNative({ source, contractId: this.contractId, method: "is_revocable", args: [bytesToScVal(schemaId)] }));
  }

  /** Attest to a stealth identity under a schema. The signer is the issuer. */
  async attest(opts: {
    schemaId: Uint8Array;
    stealthAddressHash: Uint8Array;
    data: Uint8Array;
    expirationLedger: number;
    refUid: Uint8Array;
    signer: OpaqueSigner;
  }): Promise<string> {
    const issuer = await opts.signer.publicKey();
    return this.rpc.invoke({
      source: issuer,
      contractId: this.contractId,
      method: "attest",
      contractPackage: "attestation-engine-v2",
      args: [
        addressToScVal(issuer),
        bytesToScVal(opts.schemaId),
        bytesToScVal(opts.stealthAddressHash),
        bytesToScVal(opts.data),
        u32ToScVal(opts.expirationLedger),
        bytesToScVal(opts.refUid),
      ],
      signer: opts.signer,
    });
  }

  async revokeAttestation(opts: {
    uid: Uint8Array;
    signer: OpaqueSigner;
  }): Promise<string> {
    const revoker = await opts.signer.publicKey();
    return this.rpc.invoke({
      source: revoker,
      contractId: this.contractId,
      method: "revoke_attestation",
      contractPackage: "attestation-engine-v2",
      args: [addressToScVal(revoker), bytesToScVal(opts.uid)],
      signer: opts.signer,
    });
  }
}
