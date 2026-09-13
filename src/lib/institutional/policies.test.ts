import assert from "node:assert/strict";
import test from "node:test";
import {
  assertInstitutionalPreflight,
  clearInstitutionalPolicyAdapters,
  setInstitutionalPolicyAdapter,
  validatePolicyRequirement,
  type InstitutionalPolicyRequirement,
} from "./policies";

const invoiceCommitmentHex = "11".repeat(32);
const claimCommitmentHex = "22".repeat(32);
const policyCommitmentHex = "33".repeat(32);

const verifyRequirement: InstitutionalPolicyRequirement = {
  kind: "BLACKOUT_VERIFY",
  invoiceCommitmentHex,
  claimCommitmentHex,
};

const safeRequirement: InstitutionalPolicyRequirement = {
  kind: "BLACKOUT_SAFE",
  invoiceCommitmentHex,
  policyCommitmentHex,
  requiredApprovals: 3,
};

test("institutional requirements reject zero commitments and invalid quorum", () => {
  assert.throws(() => validatePolicyRequirement({ ...verifyRequirement, claimCommitmentHex: "00".repeat(32) }), /non-zero/);
  assert.throws(() => validatePolicyRequirement({ ...safeRequirement, requiredApprovals: 0 }), /between 1 and 5/);
  assert.throws(() => validatePolicyRequirement({ ...safeRequirement, requiredApprovals: 6 }), /between 1 and 5/);
});

test("required policy without a real adapter fails closed", async () => {
  clearInstitutionalPolicyAdapters();
  await assert.rejects(() => assertInstitutionalPreflight({ requirements: [verifyRequirement] }), /no real policy adapter/);
});

test("invalid adapter evidence fails closed", async () => {
  clearInstitutionalPolicyAdapters();
  setInstitutionalPolicyAdapter("BLACKOUT_SAFE", {
    name: "broken-safe",
    async verify() { return { valid: false, evidenceId: "x", checkedAt: Date.now(), source: "test" }; },
  });
  await assert.rejects(() => assertInstitutionalPreflight({ requirements: [safeRequirement] }), /invalid or incomplete evidence/);
});

test("fresh valid evidence passes and duplicate requirements fail", async () => {
  clearInstitutionalPolicyAdapters();
  setInstitutionalPolicyAdapter("BLACKOUT_VERIFY", {
    name: "test-verify",
    async verify() { return { valid: true, evidenceId: "proof-1", checkedAt: Date.now(), source: "test" }; },
  });
  const result = await assertInstitutionalPreflight({ requirements: [verifyRequirement] });
  assert.equal(result.length, 1);
  await assert.rejects(() => assertInstitutionalPreflight({ requirements: [verifyRequirement, verifyRequirement] }), /Duplicate/);
});
