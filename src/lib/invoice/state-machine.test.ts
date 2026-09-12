import assert from "node:assert/strict";
import test from "node:test";
import { assertInvoiceTransition, canTransitionInvoice } from "./state-machine";

test("forward settlement transitions are valid", () => {
  assert.equal(canTransitionInvoice("CREATED", "ACCEPTED"), true);
  assert.equal(canTransitionInvoice("ACCEPTED", "FUNDED"), true);
  assert.equal(canTransitionInvoice("FUNDED", "PAID"), true);
  assert.equal(canTransitionInvoice("FUNDED", "REFUNDED"), true);
});

test("unfunded invoices may be cancelled", () => {
  assert.equal(canTransitionInvoice("CREATED", "CANCELLED"), true);
  assert.equal(canTransitionInvoice("ACCEPTED", "CANCELLED"), true);
  assert.equal(canTransitionInvoice("FUNDED", "CANCELLED"), false);
});

test("terminal states cannot be reopened", () => {
  assert.equal(canTransitionInvoice("PAID", "FUNDED"), false);
  assert.equal(canTransitionInvoice("REFUNDED", "FUNDED"), false);
  assert.equal(canTransitionInvoice("CANCELLED", "ACCEPTED"), false);
});

test("invalid transitions fail closed", () => {
  assert.throws(() => assertInvoiceTransition("ACCEPTED", "PAID"));
  assert.throws(() => assertInvoiceTransition("CREATED", "REFUNDED"));
});
