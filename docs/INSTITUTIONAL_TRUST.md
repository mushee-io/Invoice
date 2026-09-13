# Institutional controls: trust boundaries

Milestones 11–15 extend BLACKOUT Invoice without weakening the existing 21-circuit settlement contract.

## Verify and Safe adapters

The official application can require external BLACKOUT VERIFY and BLACKOUT SAFE evidence before using the secure funding wrapper. Evidence is accepted only when:

- it is bound to the exact invoice commitment;
- it is bound to the expected claim or treasury-policy commitment;
- the issuer Ed25519 public key is explicitly trusted by the application;
- the signature verifies;
- the evidence is not expired or issued outside the accepted clock window;
- Safe evidence reports at least the configured approval threshold.

If an adapter is required but unavailable, invalid, stale or incomplete, the wrapper fails closed.

This is application-level enforcement. The current Compact invoice contract does not yet call external contracts directly, so a custom client can bypass these external policy checks and call the base contract. Do not describe this as trustless cross-contract enforcement.

## Customer and verifier portal

`/verify` and `/portal` validate receipt or selective-disclosure artifacts before querying Midnight. Malformed, zero or unsupported fields are rejected locally, and success still requires the on-chain state to match.

## Auditor mode and Proof of Business v1

`/audit` accepts an auditor-scoped evidence bundle containing selected receivable proof IDs. The verifier re-resolves every proof against the Invoice contract and rejects non-PAID or malformed claims.

This mode minimizes disclosure compared with exporting a wallet or complete ledger, but it is not an unlinkable aggregate ZK credential: the verifier can resolve supplied proof IDs to their public invoice identifiers. The stronger aggregate claim remains unimplemented until there is a compiled privacy-preserving accumulator/proof design.
