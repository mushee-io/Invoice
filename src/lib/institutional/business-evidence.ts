import { assertNonZeroBytes32 } from "../invoice/types";

export type ReceivableProofSnapshot = {
  proofIdHex: string;
  invoiceIdHex: string;
  invoiceCommitmentHex: string;
  claim: string;
  thresholdMinor: bigint;
};

export type ReceivableProofResolver = (proofIdHex: string) => Promise<ReceivableProofSnapshot>;

export type BusinessEvidenceBundle = {
  version: 1;
  scope: "AUDITOR_SCOPED";
  verifierIdHex: string;
  paidProofIds: string[];
  amountThresholdProofIds: string[];
  createdAt: number;
  privacyNotice: "Verifier can resolve supplied proof IDs to their public invoice identifiers.";
};

const MAX_PROOFS = 64;

function normalizeProofIds(values: string[], label: string): string[] {
  if (!Array.isArray(values) || values.length > MAX_PROOFS) throw new Error(`${label} must contain at most ${MAX_PROOFS} proofs`);
  const normalized = values.map((value) => {
    assertNonZeroBytes32(value, `${label} proof id`);
    return value.replace(/^0x/i, "").toLowerCase();
  });
  if (new Set(normalized).size !== normalized.length) throw new Error(`${label} contains duplicate proof ids`);
  return normalized;
}

export function createBusinessEvidenceBundle(input: {
  verifierIdHex: string;
  paidProofIds: string[];
  amountThresholdProofIds?: string[];
  createdAt?: number;
}): BusinessEvidenceBundle {
  assertNonZeroBytes32(input.verifierIdHex, "Business evidence verifier id");
  const paidProofIds = normalizeProofIds(input.paidProofIds, "Paid proofs");
  const amountThresholdProofIds = normalizeProofIds(input.amountThresholdProofIds ?? [], "Amount-threshold proofs");
  if (!paidProofIds.length) throw new Error("Business evidence requires at least one paid-invoice proof");
  const createdAt = input.createdAt ?? Date.now();
  if (!Number.isFinite(createdAt) || createdAt <= 0) throw new Error("Business evidence createdAt is invalid");
  return {
    version: 1,
    scope: "AUDITOR_SCOPED",
    verifierIdHex: input.verifierIdHex.replace(/^0x/i, "").toLowerCase(),
    paidProofIds,
    amountThresholdProofIds,
    createdAt,
    privacyNotice: "Verifier can resolve supplied proof IDs to their public invoice identifiers.",
  };
}

export async function verifyBusinessEvidenceBundle(
  bundle: BusinessEvidenceBundle,
  resolveProof: ReceivableProofResolver,
): Promise<{
  valid: boolean;
  distinctPaidInvoiceCount: number;
  paidInvoiceIds: string[];
  minimumIndividualAmountThresholds: Array<{ invoiceIdHex: string; thresholdMinor: bigint }>;
  errors: string[];
}> {
  if (bundle.version !== 1 || bundle.scope !== "AUDITOR_SCOPED") throw new Error("Unsupported business evidence bundle version or scope");
  assertNonZeroBytes32(bundle.verifierIdHex, "Business evidence verifier id");
  const paidIds = normalizeProofIds(bundle.paidProofIds, "Paid proofs");
  const thresholdIds = normalizeProofIds(bundle.amountThresholdProofIds, "Amount-threshold proofs");
  const errors: string[] = [];
  const paidInvoiceIds = new Set<string>();
  const minimumIndividualAmountThresholds: Array<{ invoiceIdHex: string; thresholdMinor: bigint }> = [];

  for (const proofId of paidIds) {
    try {
      const proof = await resolveProof(proofId);
      if (proof.claim !== "PAID") errors.push(`${proofId}: expected PAID claim, got ${proof.claim}`);
      else paidInvoiceIds.add(proof.invoiceIdHex.toLowerCase());
    } catch (error) {
      errors.push(`${proofId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  for (const proofId of thresholdIds) {
    try {
      const proof = await resolveProof(proofId);
      if (proof.claim !== "AMOUNT_AT_LEAST" || proof.thresholdMinor <= 0n) {
        errors.push(`${proofId}: invalid amount-threshold claim`);
      } else {
        minimumIndividualAmountThresholds.push({ invoiceIdHex: proof.invoiceIdHex.toLowerCase(), thresholdMinor: proof.thresholdMinor });
      }
    } catch (error) {
      errors.push(`${proofId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return {
    valid: errors.length === 0 && paidInvoiceIds.size > 0,
    distinctPaidInvoiceCount: paidInvoiceIds.size,
    paidInvoiceIds: [...paidInvoiceIds],
    minimumIndividualAmountThresholds,
    errors,
  };
}
