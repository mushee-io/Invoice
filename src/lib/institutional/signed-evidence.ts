import { assertNonZeroBytes32 } from "../invoice/types";
import type { InstitutionalPolicyRequirement, PolicyAdapter, PolicyEvidence, PolicyKind } from "./policies";

export type SignedPolicyEvidenceArtifact = {
  version: 1;
  kind: PolicyKind;
  invoiceCommitmentHex: string;
  requirementCommitmentHex: string;
  evidenceId: string;
  issuedAt: number;
  validUntil: number;
  issuerPublicKeyHex: string;
  observedApprovals?: number;
  signatureBase64: string;
};

const MAX_EVIDENCE_LIFETIME_MS = 24 * 60 * 60_000;
const MAX_CLOCK_SKEW_MS = 60_000;

function normalizeHex(value: string): string {
  assertNonZeroBytes32(value, "Signed evidence commitment/key");
  return value.replace(/^0x/i, "").toLowerCase();
}

function hexToBytes(value: string): Uint8Array {
  const normalized = normalizeHex(value);
  return Uint8Array.from(normalized.match(/.{2}/g)!.map((byte) => Number.parseInt(byte, 16)));
}

function base64ToBytes(value: string): Uint8Array {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length % 4 !== 0) throw new Error("Signed evidence signature is not valid base64");
  const decoded = atob(value);
  return Uint8Array.from(decoded, (char) => char.charCodeAt(0));
}

export function canonicalPolicyEvidencePayload(artifact: Omit<SignedPolicyEvidenceArtifact, "signatureBase64">): Uint8Array {
  const payload = [
    "BLACKOUT_POLICY_EVIDENCE_V1",
    artifact.kind,
    normalizeHex(artifact.invoiceCommitmentHex),
    normalizeHex(artifact.requirementCommitmentHex),
    artifact.evidenceId,
    String(artifact.issuedAt),
    String(artifact.validUntil),
    normalizeHex(artifact.issuerPublicKeyHex),
    String(artifact.observedApprovals ?? 0),
  ].join("\n");
  return new TextEncoder().encode(payload);
}

function expectedRequirementCommitment(requirement: InstitutionalPolicyRequirement): string {
  return requirement.kind === "BLACKOUT_VERIFY" ? requirement.claimCommitmentHex : requirement.policyCommitmentHex;
}

export async function verifySignedPolicyEvidence(input: {
  requirement: InstitutionalPolicyRequirement;
  artifact: SignedPolicyEvidenceArtifact;
  trustedIssuerPublicKeys: string[];
  now?: number;
}): Promise<PolicyEvidence> {
  const { requirement, artifact } = input;
  const now = input.now ?? Date.now();
  if (artifact.version !== 1) throw new Error("Unsupported signed policy evidence version");
  if (artifact.kind !== requirement.kind) throw new Error("Signed evidence kind does not match policy requirement");
  if (!artifact.evidenceId?.trim() || artifact.evidenceId.length > 160) throw new Error("Signed evidence id is invalid");
  if (!Number.isFinite(artifact.issuedAt) || !Number.isFinite(artifact.validUntil)) throw new Error("Signed evidence timestamps are invalid");
  if (artifact.issuedAt > now + MAX_CLOCK_SKEW_MS) throw new Error("Signed evidence was issued in the future");
  if (artifact.validUntil <= now) throw new Error("Signed evidence has expired");
  if (artifact.validUntil - artifact.issuedAt > MAX_EVIDENCE_LIFETIME_MS) throw new Error("Signed evidence lifetime exceeds 24 hours");

  const invoiceCommitment = normalizeHex(artifact.invoiceCommitmentHex);
  const requirementCommitment = normalizeHex(artifact.requirementCommitmentHex);
  if (invoiceCommitment !== normalizeHex(requirement.invoiceCommitmentHex)) throw new Error("Signed evidence belongs to a different invoice commitment");
  if (requirementCommitment !== normalizeHex(expectedRequirementCommitment(requirement))) throw new Error("Signed evidence belongs to a different policy requirement");

  if (requirement.kind === "BLACKOUT_SAFE") {
    if (!Number.isInteger(artifact.observedApprovals) || (artifact.observedApprovals ?? 0) < requirement.requiredApprovals) {
      throw new Error("Signed treasury evidence does not satisfy the required quorum");
    }
  }

  const issuerKey = normalizeHex(artifact.issuerPublicKeyHex);
  const trusted = input.trustedIssuerPublicKeys.map(normalizeHex);
  if (!trusted.includes(issuerKey)) throw new Error("Signed evidence issuer is not trusted for this adapter");

  const { signatureBase64, ...unsigned } = artifact;
  const key = await crypto.subtle.importKey("raw", hexToBytes(issuerKey), { name: "Ed25519" }, false, ["verify"]);
  const validSignature = await crypto.subtle.verify(
    { name: "Ed25519" },
    key,
    base64ToBytes(signatureBase64),
    canonicalPolicyEvidencePayload(unsigned),
  );
  if (!validSignature) throw new Error("Signed policy evidence signature is invalid");

  return {
    valid: true,
    evidenceId: artifact.evidenceId,
    checkedAt: now,
    source: `${artifact.kind}:signed-ed25519`,
    detail: requirement.kind === "BLACKOUT_SAFE" ? `${artifact.observedApprovals} approvals attested` : "verification claim attested",
  };
}

export function createSignedEvidenceAdapter(input: {
  kind: PolicyKind;
  artifacts: SignedPolicyEvidenceArtifact[];
  trustedIssuerPublicKeys: string[];
}): PolicyAdapter {
  if (!input.trustedIssuerPublicKeys.length) throw new Error("At least one trusted evidence issuer key is required");
  return {
    name: `${input.kind}:signed-evidence-v1`,
    async verify(requirement) {
      if (requirement.kind !== input.kind) throw new Error(`Adapter ${input.kind} cannot verify ${requirement.kind}`);
      const expected = normalizeHex(expectedRequirementCommitment(requirement));
      const invoice = normalizeHex(requirement.invoiceCommitmentHex);
      const artifact = input.artifacts.find((candidate) =>
        candidate.kind === requirement.kind &&
        normalizeHex(candidate.invoiceCommitmentHex) === invoice &&
        normalizeHex(candidate.requirementCommitmentHex) === expected,
      );
      if (!artifact) throw new Error(`No signed ${input.kind} evidence matches this invoice and requirement`);
      return verifySignedPolicyEvidence({ requirement, artifact, trustedIssuerPublicKeys: input.trustedIssuerPublicKeys });
    },
  };
}
