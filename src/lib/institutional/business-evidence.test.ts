import assert from "node:assert/strict";
import test from "node:test";
import { createBusinessEvidenceBundle, verifyBusinessEvidenceBundle } from "./business-evidence";

const verifierIdHex = "aa".repeat(32);
const paid1 = "11".repeat(32);
const paid2 = "22".repeat(32);
const threshold = "33".repeat(32);

test("business evidence verifies distinct paid proofs and amount thresholds", async () => {
  const bundle = createBusinessEvidenceBundle({ verifierIdHex, paidProofIds: [paid1, paid2], amountThresholdProofIds: [threshold], createdAt: 1 });
  const result = await verifyBusinessEvidenceBundle(bundle, async (proofId) => {
    if (proofId === paid1) return { proofIdHex: proofId, invoiceIdHex: "01".repeat(32), invoiceCommitmentHex: "10".repeat(32), claim: "PAID", thresholdMinor: 0n };
    if (proofId === paid2) return { proofIdHex: proofId, invoiceIdHex: "02".repeat(32), invoiceCommitmentHex: "20".repeat(32), claim: "PAID", thresholdMinor: 0n };
    return { proofIdHex: proofId, invoiceIdHex: "01".repeat(32), invoiceCommitmentHex: "10".repeat(32), claim: "AMOUNT_AT_LEAST", thresholdMinor: 50_000n };
  });
  assert.equal(result.valid, true);
  assert.equal(result.distinctPaidInvoiceCount, 2);
  assert.equal(result.minimumIndividualAmountThresholds[0].thresholdMinor, 50_000n);
});

test("business evidence rejects duplicate proof ids", () => {
  assert.throws(() => createBusinessEvidenceBundle({ verifierIdHex, paidProofIds: [paid1, paid1] }), /duplicate/);
});

test("business evidence fails if a supplied paid proof is not a PAID claim", async () => {
  const bundle = createBusinessEvidenceBundle({ verifierIdHex, paidProofIds: [paid1] });
  const result = await verifyBusinessEvidenceBundle(bundle, async (proofId) => ({
    proofIdHex: proofId,
    invoiceIdHex: "01".repeat(32),
    invoiceCommitmentHex: "10".repeat(32),
    claim: "EXISTS",
    thresholdMinor: 0n,
  }));
  assert.equal(result.valid, false);
  assert.match(result.errors[0], /expected PAID/);
});
