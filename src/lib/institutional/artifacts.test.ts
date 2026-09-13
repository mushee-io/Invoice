import assert from "node:assert/strict";
import test from "node:test";
import { parseDisclosureArtifactJson, parseReceiptArtifactJson } from "./artifacts";

const id = "11".repeat(32);
const id2 = "22".repeat(32);
const id3 = "33".repeat(32);
const id4 = "44".repeat(32);
const id5 = "55".repeat(32);
const tx = "66".repeat(32);

test("valid receipt artifact parses", () => {
  const parsed = parseReceiptArtifactJson(JSON.stringify({
    receiptIdHex: id,
    invoiceIdHex: id2,
    verifierIdHex: id3,
    invoiceCommitmentHex: id4,
    paymentNullifierHex: id5,
    transactionId: tx,
  }));
  assert.equal(parsed.receiptIdHex, id);
});

test("zero receipt commitment fails closed", () => {
  assert.throws(() => parseReceiptArtifactJson(JSON.stringify({
    receiptIdHex: id,
    invoiceIdHex: id2,
    verifierIdHex: id3,
    invoiceCommitmentHex: "00".repeat(32),
    paymentNullifierHex: id5,
    transactionId: tx,
  })), /all-zero/);
});

test("valid disclosure converts bigint string fields", () => {
  const parsed = parseDisclosureArtifactJson(JSON.stringify({
    disclosureIdHex: id,
    invoiceIdHex: id2,
    field: "AMOUNT",
    valueMinor: "50000",
    openingHex: id3,
    verifierIdHex: id4,
    expiresAt: "2000000000",
    fieldCommitmentHex: id5,
    transactionId: tx,
  }));
  assert.equal(parsed.valueMinor, 50_000n);
});

test("negative or malformed disclosure values fail closed", () => {
  assert.throws(() => parseDisclosureArtifactJson(JSON.stringify({
    disclosureIdHex: id,
    invoiceIdHex: id2,
    field: "AMOUNT",
    valueMinor: "-1",
    openingHex: id3,
    verifierIdHex: id4,
    expiresAt: "2000000000",
    fieldCommitmentHex: id5,
    transactionId: tx,
  })), /invalid/);
});
