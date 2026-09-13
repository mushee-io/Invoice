import type { DisclosureArtifact, DisclosureField, ReceiptArtifact } from "../invoice/types";
import { assertNonZeroBytes32 } from "../invoice/types";

const TX_ID = /^(?:0x)?[0-9a-f]{64}$/i;

function assertTransactionId(value: string): void {
  if (!TX_ID.test(value)) throw new Error("Transaction id must be 32-byte hexadecimal data");
}

function parseBigIntField(value: unknown, label: string): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "string" && /^\d+$/.test(value)) return BigInt(value);
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return BigInt(value);
  throw new Error(`${label} is invalid`);
}

export function validateReceiptArtifact(value: ReceiptArtifact): ReceiptArtifact {
  assertNonZeroBytes32(value.receiptIdHex, "Receipt id");
  assertNonZeroBytes32(value.invoiceIdHex, "Receipt invoice id");
  assertNonZeroBytes32(value.verifierIdHex, "Receipt verifier id");
  assertNonZeroBytes32(value.invoiceCommitmentHex, "Receipt invoice commitment");
  assertNonZeroBytes32(value.paymentNullifierHex, "Receipt payment nullifier");
  assertTransactionId(value.transactionId);
  return value;
}

export function validateDisclosureArtifact(value: DisclosureArtifact): DisclosureArtifact {
  assertNonZeroBytes32(value.disclosureIdHex, "Disclosure id");
  assertNonZeroBytes32(value.invoiceIdHex, "Disclosure invoice id");
  assertNonZeroBytes32(value.openingHex, "Disclosure opening");
  assertNonZeroBytes32(value.verifierIdHex, "Disclosure verifier id");
  assertNonZeroBytes32(value.fieldCommitmentHex, "Disclosure field commitment");
  if (!(["AMOUNT", "TAX", "DUE_DATE"] as DisclosureField[]).includes(value.field)) throw new Error("Disclosure field is unsupported");
  if (value.valueMinor < 0n) throw new Error("Disclosure value must not be negative");
  if (value.expiresAt <= 0n) throw new Error("Disclosure expiry is invalid");
  assertTransactionId(value.transactionId);
  return value;
}

export function parseReceiptArtifactJson(text: string): ReceiptArtifact {
  const parsed = JSON.parse(text) as Record<string, unknown>;
  const artifact: ReceiptArtifact = {
    receiptIdHex: String(parsed.receiptIdHex ?? ""),
    invoiceIdHex: String(parsed.invoiceIdHex ?? ""),
    verifierIdHex: String(parsed.verifierIdHex ?? ""),
    invoiceCommitmentHex: String(parsed.invoiceCommitmentHex ?? ""),
    paymentNullifierHex: String(parsed.paymentNullifierHex ?? ""),
    transactionId: String(parsed.transactionId ?? ""),
  };
  return validateReceiptArtifact(artifact);
}

export function parseDisclosureArtifactJson(text: string): DisclosureArtifact {
  const parsed = JSON.parse(text) as Record<string, unknown>;
  const artifact: DisclosureArtifact = {
    disclosureIdHex: String(parsed.disclosureIdHex ?? ""),
    invoiceIdHex: String(parsed.invoiceIdHex ?? ""),
    field: String(parsed.field ?? "") as DisclosureField,
    valueMinor: parseBigIntField(parsed.valueMinor, "Disclosure value"),
    openingHex: String(parsed.openingHex ?? ""),
    verifierIdHex: String(parsed.verifierIdHex ?? ""),
    expiresAt: parseBigIntField(parsed.expiresAt, "Disclosure expiry"),
    fieldCommitmentHex: String(parsed.fieldCommitmentHex ?? ""),
    transactionId: String(parsed.transactionId ?? ""),
  };
  return validateDisclosureArtifact(artifact);
}
