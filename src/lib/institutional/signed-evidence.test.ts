import assert from "node:assert/strict";
import test from "node:test";
import { webcrypto } from "node:crypto";
import { canonicalPolicyEvidencePayload, verifySignedPolicyEvidence, type SignedPolicyEvidenceArtifact } from "./signed-evidence";
import type { InstitutionalPolicyRequirement } from "./policies";

const cryptoApi = webcrypto as unknown as Crypto;
const invoiceCommitmentHex = "11".repeat(32);
const claimCommitmentHex = "22".repeat(32);
const policyCommitmentHex = "33".repeat(32);

function bytesToHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

function bytesToBase64(bytes: ArrayBuffer): string {
  return Buffer.from(bytes).toString("base64");
}

async function signedArtifact(input: Omit<SignedPolicyEvidenceArtifact, "issuerPublicKeyHex" | "signatureBase64">) {
  const pair = await cryptoApi.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]) as CryptoKeyPair;
  const publicRaw = await cryptoApi.subtle.exportKey("raw", pair.publicKey);
  const issuerPublicKeyHex = bytesToHex(publicRaw);
  const unsigned = { ...input, issuerPublicKeyHex };
  const signature = await cryptoApi.subtle.sign({ name: "Ed25519" }, pair.privateKey, canonicalPolicyEvidencePayload(unsigned));
  return { artifact: { ...unsigned, signatureBase64: bytesToBase64(signature) }, issuerPublicKeyHex };
}

test("valid Blackout Verify signed evidence passes", async () => {
  const now = Date.now();
  const requirement: InstitutionalPolicyRequirement = { kind: "BLACKOUT_VERIFY", invoiceCommitmentHex, claimCommitmentHex };
  const { artifact, issuerPublicKeyHex } = await signedArtifact({
    version: 1,
    kind: "BLACKOUT_VERIFY",
    invoiceCommitmentHex,
    requirementCommitmentHex: claimCommitmentHex,
    evidenceId: "verify-proof-1",
    issuedAt: now - 1000,
    validUntil: now + 60_000,
  });
  const result = await verifySignedPolicyEvidence({ requirement, artifact, trustedIssuerPublicKeys: [issuerPublicKeyHex], now });
  assert.equal(result.valid, true);
});

test("Safe evidence below required quorum fails closed", async () => {
  const now = Date.now();
  const requirement: InstitutionalPolicyRequirement = { kind: "BLACKOUT_SAFE", invoiceCommitmentHex, policyCommitmentHex, requiredApprovals: 3 };
  const { artifact, issuerPublicKeyHex } = await signedArtifact({
    version: 1,
    kind: "BLACKOUT_SAFE",
    invoiceCommitmentHex,
    requirementCommitmentHex: policyCommitmentHex,
    evidenceId: "safe-proof-1",
    issuedAt: now - 1000,
    validUntil: now + 60_000,
    observedApprovals: 2,
  });
  await assert.rejects(() => verifySignedPolicyEvidence({ requirement, artifact, trustedIssuerPublicKeys: [issuerPublicKeyHex], now }), /does not satisfy/);
});

test("tampered signed evidence fails signature verification", async () => {
  const now = Date.now();
  const requirement: InstitutionalPolicyRequirement = { kind: "BLACKOUT_VERIFY", invoiceCommitmentHex, claimCommitmentHex };
  const { artifact, issuerPublicKeyHex } = await signedArtifact({
    version: 1,
    kind: "BLACKOUT_VERIFY",
    invoiceCommitmentHex,
    requirementCommitmentHex: claimCommitmentHex,
    evidenceId: "verify-proof-2",
    issuedAt: now - 1000,
    validUntil: now + 60_000,
  });
  artifact.evidenceId = "tampered";
  await assert.rejects(() => verifySignedPolicyEvidence({ requirement, artifact, trustedIssuerPublicKeys: [issuerPublicKeyHex], now }), /signature is invalid/);
});
