import assert from "node:assert/strict";
import test from "node:test";
import { assertInvoiceDraft, assertMilestoneDraft, assertNonZeroBytes32 } from "./types";

const nz = "11".repeat(32);
const zero = "00".repeat(32);

function validInvoice() {
  return {
    invoiceIdHex: "01".repeat(32),
    tokenColorHex: "02".repeat(32),
    witness: {
      amountMinor: 1000n,
      taxMinor: 100n,
      payerPublicKeyHex: "03".repeat(32),
      supplierPublicKeyHex: "04".repeat(32),
      payerCoinPublicKeyHex: "05".repeat(32),
      supplierCoinPublicKeyHex: "06".repeat(32),
      dueAt: 2_000_000_000n,
      saltHex: "07".repeat(32),
    },
  };
}

test("all-zero bytes32 values are rejected", () => {
  assert.throws(() => assertNonZeroBytes32(zero, "secret"), /all-zero/);
  assert.doesNotThrow(() => assertNonZeroBytes32(nz, "secret"));
});

test("invoice identifiers token colours keys and salts cannot be zero", () => {
  const base = validInvoice();
  assert.throws(() => assertInvoiceDraft({ ...base, invoiceIdHex: zero }), /Invoice identifier.*all-zero/);
  assert.throws(() => assertInvoiceDraft({ ...base, tokenColorHex: zero }), /Token colour.*all-zero/);
  assert.throws(() => assertInvoiceDraft({ ...base, witness: { ...base.witness, payerPublicKeyHex: zero } }), /Payer public key.*all-zero/);
  assert.throws(() => assertInvoiceDraft({ ...base, witness: { ...base.witness, supplierPublicKeyHex: zero } }), /Supplier public key.*all-zero/);
  assert.throws(() => assertInvoiceDraft({ ...base, witness: { ...base.witness, payerCoinPublicKeyHex: zero } }), /Payer refund key.*all-zero/);
  assert.throws(() => assertInvoiceDraft({ ...base, witness: { ...base.witness, supplierCoinPublicKeyHex: zero } }), /Supplier payout key.*all-zero/);
  assert.throws(() => assertInvoiceDraft({ ...base, witness: { ...base.witness, saltHex: zero } }), /Invoice salt.*all-zero/);
});

test("invoice financial bounds fail closed", () => {
  const base = validInvoice();
  assert.throws(() => assertInvoiceDraft({ ...base, witness: { ...base.witness, amountMinor: 0n } }), /amount/);
  assert.throws(() => assertInvoiceDraft({ ...base, witness: { ...base.witness, taxMinor: 1001n } }), /tax/);
  assert.throws(() => assertInvoiceDraft({ ...base, witness: { ...base.witness, taxMinor: -1n } }), /tax/);
});

test("milestone indices amounts and salts are bounded", () => {
  const good = { invoiceIdHex: "08".repeat(32), index: 1, witness: { amountMinor: 500n, saltHex: "09".repeat(32) } };
  assert.doesNotThrow(() => assertMilestoneDraft(good));
  assert.throws(() => assertMilestoneDraft({ ...good, index: -1 }), /Uint16/);
  assert.throws(() => assertMilestoneDraft({ ...good, index: 65536 }), /Uint16/);
  assert.throws(() => assertMilestoneDraft({ ...good, witness: { ...good.witness, amountMinor: 0n } }), /amount/);
  assert.throws(() => assertMilestoneDraft({ ...good, witness: { ...good.witness, saltHex: zero } }), /Milestone salt.*all-zero/);
});
