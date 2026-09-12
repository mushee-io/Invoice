export type InvoiceStatus = "CREATED" | "ACCEPTED" | "FUNDED" | "PAID" | "CANCELLED" | "REFUNDED";
export type MilestoneStatus = "REGISTERED" | "FUNDED" | "RELEASED" | "REFUNDED";
export type ReceivableClaim = "EXISTS" | "ACCEPTED" | "PAID" | "AMOUNT_AT_LEAST";
export type DisclosureField = "AMOUNT" | "TAX" | "DUE_DATE";

export type PrivateInvoiceWitness = {
  amountMinor: bigint;
  taxMinor: bigint;
  payerPublicKeyHex: string;
  supplierPublicKeyHex: string;
  payerCoinPublicKeyHex: string;
  supplierCoinPublicKeyHex: string;
  dueAt: bigint;
  saltHex: string;
};

export type InvoiceDraft = {
  invoiceIdHex: string;
  tokenColorHex: string;
  witness: PrivateInvoiceWitness;
};

export type PrivateMilestoneWitness = {
  amountMinor: bigint;
  saltHex: string;
};

export type MilestoneDraft = {
  invoiceIdHex: string;
  index: number;
  witness: PrivateMilestoneWitness;
};

export type DisclosureArtifact = {
  disclosureIdHex: string;
  invoiceIdHex: string;
  field: DisclosureField;
  valueMinor: bigint;
  openingHex: string;
  verifierIdHex: string;
  expiresAt: bigint;
  fieldCommitmentHex: string;
  transactionId: string;
};

export type ReceiptArtifact = {
  receiptIdHex: string;
  invoiceIdHex: string;
  verifierIdHex: string;
  invoiceCommitmentHex: string;
  paymentNullifierHex: string;
  transactionId: string;
};

const UINT64_MAX = (1n << 64n) - 1n;
const ZERO_BYTES32 = /^(?:0x)?0{64}$/i;

export function assertBytes32(value: string, label: string): void {
  if (!/^(?:0x)?[0-9a-f]{64}$/i.test(value)) throw new Error(`${label} must be exactly 32 bytes of hexadecimal data`);
}

export function assertNonZeroBytes32(value: string, label: string): void {
  assertBytes32(value, label);
  if (ZERO_BYTES32.test(value)) throw new Error(`${label} must not be all-zero`);
}

export function assertInvoiceWitness(witness: PrivateInvoiceWitness): void {
  if (witness.amountMinor <= 0n || witness.amountMinor > UINT64_MAX) throw new Error("Invoice amount is outside Uint64 range");
  if (witness.taxMinor < 0n || witness.taxMinor > witness.amountMinor) throw new Error("Invoice tax must be between zero and invoice amount");
  if (witness.dueAt <= 0n || witness.dueAt > UINT64_MAX) throw new Error("Invoice due date is outside Uint64 range");
  assertNonZeroBytes32(witness.payerPublicKeyHex, "Payer public key");
  assertNonZeroBytes32(witness.supplierPublicKeyHex, "Supplier public key");
  assertNonZeroBytes32(witness.payerCoinPublicKeyHex, "Payer refund key");
  assertNonZeroBytes32(witness.supplierCoinPublicKeyHex, "Supplier payout key");
  assertNonZeroBytes32(witness.saltHex, "Invoice salt");
}

export function assertInvoiceDraft(draft: InvoiceDraft): void {
  assertNonZeroBytes32(draft.invoiceIdHex, "Invoice identifier");
  assertNonZeroBytes32(draft.tokenColorHex, "Token colour");
  assertInvoiceWitness(draft.witness);
}

export function assertMilestoneDraft(draft: MilestoneDraft): void {
  assertNonZeroBytes32(draft.invoiceIdHex, "Invoice identifier");
  if (!Number.isInteger(draft.index) || draft.index < 0 || draft.index > 0xffff) throw new Error("Milestone index must fit Uint16");
  if (draft.witness.amountMinor <= 0n || draft.witness.amountMinor > UINT64_MAX) throw new Error("Milestone amount is outside Uint64 range");
  assertNonZeroBytes32(draft.witness.saltHex, "Milestone salt");
}
