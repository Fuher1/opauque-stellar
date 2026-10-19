import React from "react";
import { BackupExport } from "../../components/recovery/BackupExport";
import { BackupImport } from "../../components/recovery/BackupImport";
import { KeyRotationWizard } from "../../components/security/KeyRotationWizard";
import { ErrorReportingSettings } from "../../components/ErrorReportingSettings";
import { SigningAuditLogSettings } from "../../components/SigningAuditLogSettings";
import { StorageEncryptionSettings } from "../../components/StorageEncryptionSettings";
import { MotionSettings } from "../../components/MotionSettings";
import { LanguageSettings } from "../../components/LanguageSettings";
import { ProofDiagnosticsPanel } from "../../components/ProofDiagnosticsPanel";
import { SessionTimeoutSettings } from "../../components/security/SessionTimeoutSettings";

export const SecuritySettings: React.FC = () => {
  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      <h1 className="text-3xl font-bold mb-8">Security & Recovery Settings</h1>

      <div className="space-y-8">
        <section>
          <h2 className="text-2xl font-semibold mb-4">Storage Encryption</h2>
          <StorageEncryptionSettings />
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">Backup & Restore</h2>
          <div className="grid md:grid-cols-2 gap-6">
            <BackupExport />
            <BackupImport />
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">Account Migration</h2>
          <KeyRotationWizard />
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">Accessibility & Language</h2>
          <div className="grid md:grid-cols-2 gap-6">
            <MotionSettings />
            <LanguageSettings />
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">Diagnostics</h2>
          <div className="space-y-6">
            <ErrorReportingSettings />
            <ProofDiagnosticsPanel />
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">Signing activity</h2>
          <SigningAuditLogSettings />
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">Session</h2>
          <SessionTimeoutSettings />
        </section>
      </div>
    </div>
  );
};
