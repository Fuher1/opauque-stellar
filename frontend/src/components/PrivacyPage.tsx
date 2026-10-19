import { Link } from "react-router-dom";
import { LegalPageLayout } from "./LegalPageLayout";
import { ABUSE_POLICY_ROUTE, PUBLIC_CONTACTS } from "../lib/abusePolicy";
import { PRIVACY_NOT_HIDDEN, THREAT_MODEL_ROUTE } from "../lib/privacyThreatModel";

export function PrivacyPage() {
  return (
    <LegalPageLayout title="Privacy Policy">
      <section>
        <h2 className="text-white font-medium text-base mb-2">Data collection</h2>
        <p>
          The Opaque reference app does not require an account, name, email address, or
          custodial profile to use protocol features. Normal wallet use happens in your
          browser and through your selected Stellar wallet and network providers.
        </p>
      </section>

      <section>
        <h2 className="text-white font-medium text-base mb-2">Local storage</h2>
        <p>
          Ghost addresses, pool notes, transaction logs, preferences, and recovery data
          may be stored locally on your device. This data is needed to discover receives,
          sweep funds, and restore wallet state. Clearing browser storage, losing a
          device, or losing a backup password can cause permanent loss of access.
        </p>
        <p className="mt-2">
          Local transaction history keeps the amount, token, timestamp, transaction hash,
          and a counterparty label. For attestations, the counterparty is a short hashed
          reference to the recipient, not the recipient's full meta-address.
        </p>
      </section>

      <section>
        <h2 className="text-white font-medium text-base mb-2">Blockchain and provider data</h2>
        <p>
          Stellar ledger data is public. Contract calls, timestamps, amounts, fees,
          nullifiers, fee-payer accounts, and public proof inputs may be visible to
          anyone. RPC, Horizon, wallet, relayer, gateway, and indexer providers may also
          observe request timing, IP metadata, queried contracts, and account lookups
          depending on how you connect.
        </p>
      </section>

      <section>
        <h2 className="text-white font-medium text-base mb-2">Support and abuse reports</h2>
        <p>
          If you email support or open a GitHub issue, the report may include the contact
          details, wallet addresses, transaction hashes, screenshots, and other context
          you choose to provide. Reports are used for support, abuse triage, security
          review, and legal compliance. Do not put private keys, seed phrases, passwords,
          or sensitive victim data in public issues. The app also supports a sanitized
          diagnostics export with app version, network, deployed contract IDs, feature
          flags, and scrubbed sync/error details; it intentionally excludes private keys,
          proofs, signatures, full addresses, and raw metadata. Support can inspect the
          sanitized bundle to triage a crash or failed sync, but Opaque cannot reverse a
          lost local backup, recovered secret, or on-chain transaction. See the{" "}
          <Link
            to={ABUSE_POLICY_ROUTE}
            className="text-white underline hover:text-white font-medium"
          >
            Abuse &amp; Sanctions Response Policy
          </Link>{" "}
          or email{" "}
          <a
            href={`mailto:${PUBLIC_CONTACTS.support.email}`}
            className="text-white underline hover:text-white font-medium"
          >
            {PUBLIC_CONTACTS.support.email}
          </a>
          .
        </p>
      </section>

      <section>
        <h2 className="text-white font-medium text-base mb-2">Privacy threat model</h2>
        <p className="mb-3">
          Opaque reduces some forms of linkability, but it does not provide full
          anonymity. Review these limits before using stealth payments, privacy pools,
          relayers, or ZK reputation:
        </p>
        <ul className="list-disc pl-5 space-y-2 mb-3">
          {PRIVACY_NOT_HIDDEN.slice(0, 4).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>
          <Link
            to={THREAT_MODEL_ROUTE}
            className="text-white underline hover:text-white font-medium"
          >
            Read the full privacy threat model
          </Link>{" "}
          for adversaries, assumptions, mitigations, and residual risks.
        </p>
      </section>

      <section>
        <h2 className="text-white font-medium text-base mb-2">Retention and control</h2>
        <p>
          Local wallet data remains under your browser profile unless you export it,
          clear it, or send it to another service. Public ledger data cannot be deleted
          by Opaque. Support reports are retained only as needed for response, security,
          compliance, and recordkeeping.
        </p>
      </section>
    </LegalPageLayout>
  );
}
