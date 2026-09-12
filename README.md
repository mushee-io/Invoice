# BLACKOUT INVOICE

**Get paid. Prove it happened. Reveal nothing else.**

BLACKOUT INVOICE is a confidential commercial settlement protocol built for Midnight. LIVE mode fails closed: the UI never reports protocol success until Midnight ledger state confirms it.

## Milestones 1–10

1. **Foundation** — deterministic invoice lifecycle, typed domain model, tests, fail-closed runtime.
2. **Private invoice model** — committed amount, tax, payer/supplier authorities, shielded payout/refund keys, due date and salt.
3. **Compact contract** — authority proofs, domain-separated commitments/nullifiers and replay protection.
4. **Lace + Midnight** — real Lace connection, delegated proving, encrypted private state, deploy/join and indexer confirmation.
5. **Private payment** — contract-bound shielded funding and settlement; `PAID` only after ledger confirmation.
6. **Proof Receivables** — prove invoice existence, acceptance, payment, or `amount >= threshold` without disclosing the exact private amount.
7. **Private Escrow** — shielded invoice funds are held by the contract until release; unfunded cancellation and two-party shielded refund paths are supported.
8. **Milestone Escrow** — independently committed shielded tranches with register, fund, release and two-step refund flows. Each tranche has independent replay/nullifier protection.
9. **Selective Disclosure** — supplier-authorized disclosures for amount, tax or due date using a verifier-scoped, expiring on-chain commitment plus a private value/opening handoff. Disclosures can be revoked.
10. **Private Receipts** — after a real paid invoice, issue a verifier-scoped receipt bound to the invoice commitment and payment nullifier without publishing the invoice amount or counterparties.

## Protocol v2 circuits

The current Compact 0.31.1 build compiles **21 circuits**:

- invoice: `createInvoice`, `acceptInvoice`, `cancelInvoice`, `fundInvoice`, `payInvoice`, `approveInvoiceRefund`, `refundInvoice`
- proof receivables: `proveInvoiceExists`, `proveInvoiceAccepted`, `proveInvoicePaid`, `proveAmountAtLeast`
- milestone escrow: `registerMilestone`, `fundMilestone`, `releaseMilestone`, `approveMilestoneRefund`, `refundMilestone`
- selective disclosure: `createAmountDisclosure`, `createTaxDisclosure`, `createDueDateDisclosure`, `revokeDisclosure`
- receipts: `createReceipt`

## Refund safety

Refunds do **not** require either counterparty to share its secret with the other party.

1. Supplier proves refund approval and publishes a one-time approval nullifier.
2. Payer independently proves payer authority and executes the shielded refund.
3. The terminal refund state prevents replay.

The same pattern is used for milestone refunds.

## Privacy boundary

Public ledger state includes commitments, minimal lifecycle state, proof/disclosure/receipt identifiers, selected public thresholds, expiries and replay nullifiers.

Private witness state includes exact invoice amount, tax, authority secrets, payout/refund keys, due date, milestone amounts, milestone salts, disclosure values/openings and funded-coin witness data.

## Known limitations — not simulated

- **Paid-before-due proof is not implemented yet.** Compact can compare the current block time against a public target, but protocol v2 does not fabricate a historical payment timestamp for a private due date. A future version should commit settlement time in a privacy-preserving way before exposing that claim.
- **Milestone tranches are independently bounded by the invoice amount, but protocol v2 does not yet prove that the aggregate of every registered tranche is <= the private invoice total.** Payer authorization is still required before each tranche can actually be funded. A future milestone-root/allocation circuit should enforce the private aggregate cryptographically.
- Milestone releases do not automatically mark the whole invoice `PAID`; a whole-invoice paid proof/receipt is only created from the whole-invoice settlement path today.
- GitHub CI can compile circuits, generate proving assets and build the browser app, but it cannot replace an interactive Lace-signed Preview end-to-end transaction test.

## Verified build

The Milestones 1–10 source was verified in GitHub Actions on commit `29600917a7ab8d85e0a6f937949f620da37fdf31`:

- TypeScript: PASS
- state-machine tests: 4/4 PASS
- Compact 0.31.1: PASS
- circuits compiled: 21/21
- proving assets prepared: 21/21
- Next.js production build: PASS

