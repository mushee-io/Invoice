"use client";

import { useState } from "react";
import {
  assertInstitutionalPreflight,
  clearInstitutionalPolicyAdapters,
  setInstitutionalPolicyAdapter,
  type InstitutionalPolicyRequirement,
  type PolicyEvidence,
} from "@/lib/institutional/policies";
import { createSignedEvidenceAdapter, type SignedPolicyEvidenceArtifact } from "@/lib/institutional/signed-evidence";

function parseArtifact(text: string): SignedPolicyEvidenceArtifact {
  const value = JSON.parse(text) as Record<string, unknown>;
  return {
    version: 1,
    kind: String(value.kind ?? "") as SignedPolicyEvidenceArtifact["kind"],
    invoiceCommitmentHex: String(value.invoiceCommitmentHex ?? ""),
    requirementCommitmentHex: String(value.requirementCommitmentHex ?? ""),
    evidenceId: String(value.evidenceId ?? ""),
    issuedAt: Number(value.issuedAt),
    validUntil: Number(value.validUntil),
    issuerPublicKeyHex: String(value.issuerPublicKeyHex ?? ""),
    observedApprovals: value.observedApprovals === undefined ? undefined : Number(value.observedApprovals),
    signatureBase64: String(value.signatureBase64 ?? ""),
  };
}

export default function InstitutionalPolicyPanel() {
  const [invoiceCommitment, setInvoiceCommitment] = useState("");
  const [claimCommitment, setClaimCommitment] = useState("");
  const [verifyIssuerKey, setVerifyIssuerKey] = useState("");
  const [verifyArtifact, setVerifyArtifact] = useState("");
  const [safePolicyCommitment, setSafePolicyCommitment] = useState("");
  const [requiredApprovals, setRequiredApprovals] = useState("3");
  const [safeIssuerKey, setSafeIssuerKey] = useState("");
  const [safeArtifact, setSafeArtifact] = useState("");
  const [requireVerify, setRequireVerify] = useState(true);
  const [requireSafe, setRequireSafe] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [evidence, setEvidence] = useState<PolicyEvidence[]>([]);

  async function verifyPolicies() {
    setBusy(true); setError(""); setEvidence([]);
    try {
      clearInstitutionalPolicyAdapters();
      const requirements: InstitutionalPolicyRequirement[] = [];

      if (requireVerify) {
        const artifact = parseArtifact(verifyArtifact);
        setInstitutionalPolicyAdapter("BLACKOUT_VERIFY", createSignedEvidenceAdapter({
          kind: "BLACKOUT_VERIFY",
          artifacts: [artifact],
          trustedIssuerPublicKeys: [verifyIssuerKey],
        }));
        requirements.push({ kind: "BLACKOUT_VERIFY", invoiceCommitmentHex: invoiceCommitment, claimCommitmentHex: claimCommitment });
      }

      if (requireSafe) {
        const artifact = parseArtifact(safeArtifact);
        setInstitutionalPolicyAdapter("BLACKOUT_SAFE", createSignedEvidenceAdapter({
          kind: "BLACKOUT_SAFE",
          artifacts: [artifact],
          trustedIssuerPublicKeys: [safeIssuerKey],
        }));
        requirements.push({
          kind: "BLACKOUT_SAFE",
          invoiceCommitmentHex: invoiceCommitment,
          policyCommitmentHex: safePolicyCommitment,
          requiredApprovals: Number(requiredApprovals),
        });
      }

      if (!requirements.length) throw new Error("Enable at least one institutional policy requirement");
      setEvidence(await assertInstitutionalPreflight({ requirements }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally { setBusy(false); }
  }

  return <main className="shell">
    <header>
      <div><small>BLACKOUT / INSTITUTIONAL</small><h1>POLICY GATE</h1></div>
      <code>VERIFY. AUTHORIZE. THEN FUND.</code>
    </header>

    <section className="hero compactHero">
      <p>MILESTONES 11–12 / VERIFY + SAFE</p>
      <h2>NO POLICY.<br />NO<br />PAYMENT.</h2>
      <span>Cryptographically verify external Blackout Verify and Blackout Safe evidence before the official funding path is allowed to proceed.</span>
    </section>

    <div className="grid">
      <section className="panel wide">
        <h3>01 / INVOICE BINDING</h3>
        <div className="fields">
          <label>Invoice commitment<input value={invoiceCommitment} onChange={(event) => setInvoiceCommitment(event.target.value)} /></label>
          <label>Verify required<select value={requireVerify ? "yes" : "no"} onChange={(event) => setRequireVerify(event.target.value === "yes")}><option value="yes">YES</option><option value="no">NO</option></select></label>
          <label>Safe required<select value={requireSafe ? "yes" : "no"} onChange={(event) => setRequireSafe(event.target.value === "yes")}><option value="yes">YES</option><option value="no">NO</option></select></label>
        </div>
      </section>

      <section className="panel">
        <h3>02 / BLACKOUT VERIFY</h3>
        <label>Claim commitment<input value={claimCommitment} onChange={(event) => setClaimCommitment(event.target.value)} /></label>
        <label>Trusted Verify issuer public key<input value={verifyIssuerKey} onChange={(event) => setVerifyIssuerKey(event.target.value)} /></label>
        <textarea className="artifactInput compactInput" spellCheck={false} placeholder="Signed BLACKOUT_VERIFY evidence JSON" value={verifyArtifact} onChange={(event) => setVerifyArtifact(event.target.value)} />
      </section>

      <section className="panel">
        <h3>03 / BLACKOUT SAFE</h3>
        <label>Safe policy commitment<input value={safePolicyCommitment} onChange={(event) => setSafePolicyCommitment(event.target.value)} /></label>
        <label>Required approvals<input value={requiredApprovals} onChange={(event) => setRequiredApprovals(event.target.value)} /></label>
        <label>Trusted Safe issuer public key<input value={safeIssuerKey} onChange={(event) => setSafeIssuerKey(event.target.value)} /></label>
        <textarea className="artifactInput compactInput" spellCheck={false} placeholder="Signed BLACKOUT_SAFE evidence JSON" value={safeArtifact} onChange={(event) => setSafeArtifact(event.target.value)} />
      </section>

      <section className="panel wide terminal">
        <h3>04 / PRE-FUNDING RESULT <b>{evidence.length ? "AUTHORIZED" : "BLOCKED"}</b></h3>
        <div className="flow"><button disabled={busy} onClick={() => void verifyPolicies()}>RUN INSTITUTIONAL PREFLIGHT</button></div>
        {error && <p className="errorBox">FAIL CLOSED — {error}</p>}
        {evidence.map((item) => <div className="log" key={item.evidenceId}><time>PASS</time><span>{item.source} / {item.evidenceId} / {item.detail ?? "verified"}</span></div>)}
        <p className="privacy">This is cryptographic application-level gating. The current 21-circuit Invoice contract does not yet enforce these external modules on-chain because direct Compact cross-contract composition is not treated as production-ready here. A custom client could bypass application-level gating; the official secure-funding wrapper cannot.</p>
      </section>
    </div>
  </main>;
}
