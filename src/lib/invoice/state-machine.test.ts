import assert from "node:assert/strict";
import test from "node:test";
import { assertInvoiceTransition, canTransitionInvoice } from "./state-machine";

test("only forward invoice transitions are valid", () => {
  assert.equal(canTransitionInvoice("CREATED", "ACCEPTED"), true);
  assert.equal(canTransitionInvoice("ACCEPTED", "FUNDED"), true);
  assert.equal(canTransitionInvoice("FUNDED", "PAID"), true);
  assert.equal(canTransitionInvoice("CREATED", "PAID"), false);
  assert.equal(canTransitionInvoice("PAID", "FUNDED"), false);
});

test("invalid transitions fail closed", () => {
  assert.throws(() => assertInvoiceTransition("ACCEPTED", "PAID"));
});
