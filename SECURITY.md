# BLACKOUT Invoice Security

BLACKOUT Invoice handles confidential commercial data and shielded settlement. Security changes must preserve the protocol's fail-closed model: if a proof, wallet dependency, contract state, or indexer confirmation is unavailable, the application must not invent success.

## Supported security posture

The current protocol is designed around these invariants:

- Private invoice witnesses are commitment-bound before settlement.
- Payer and supplier authorities are distinct and never intentionally shared between parties.
- Invoice and milestone releases require the expected authority and state transition.
- Shielded funding value and token colour must match the committed private invoice or milestone witness.
- Settlement and refunds consume contract-held shielded coins, not frontend balance flags.
- Replay-sensitive actions use domain-separated nullifiers.
- Refunds require a supplier approval proof and a separate payer execution proof.
- Selective disclosures expose only a verifier-scoped commitment, expiry and chosen field proof.
- Receipts bind the invoice commitment and payment nullifier to a verifier identifier.
- The frontend does not mark PAID, REFUNDED, RELEASED or other terminal states until the Midnight indexer confirms the ledger state.
- Private-state storage is encrypted and isolated by wallet account and contract.
- All-zero identifiers, salts, keys and authority secrets are rejected by the client validation layer.

## Trust boundaries

BLACKOUT Invoice still relies on:

1. The Midnight Preview/Preprod network and its ledger/runtime correctness.
2. The connected Lace-compatible wallet for user authorization, balancing and transaction submission.
3. Midnight delegated proving and proving assets produced from the checked-in Compact source.
4. The indexer for timely state discovery. The contract remains the source of truth; stale indexer data must never be treated as settlement success.
5. The user's endpoint security. A compromised browser or operating system can steal secrets before they reach encrypted private-state storage.

## Deliberate limitations

The current protocol does **not** claim:

- a historical `paid-before-due-date` proof; settlement time is not yet committed in a privacy-preserving historical proof record;
- a private aggregate proof that the sum of all registered milestone amounts is less than or equal to the invoice total;
- formal verification or an external professional audit;
- mainnet production readiness.

These must not be represented as implemented until their corresponding Compact invariants and tests exist.

## Security requirements for contributions

Changes touching settlement, proof creation, private state, wallet adapters or generated Compact bindings must:

- preserve exact dependency pins;
- pass TypeScript and adversarial unit tests;
- compile every exported Compact circuit with Compact 0.31.x;
- regenerate and verify every prover, verifier and ZKIR asset;
- pass the production Next.js build;
- avoid logging private witnesses, authority secrets, disclosure openings or private-state passwords;
- avoid demo fallbacks in LIVE mode;
- avoid accepting frontend state as proof of settlement;
- maintain domain separation for new nullifiers and commitments.

## Reporting a vulnerability

Do not publish an exploitable vulnerability or private witness data in a public issue. Contact the project maintainers privately with:

- affected commit;
- impacted circuit or runtime path;
- reproduction steps using testnet only;
- expected vs actual invariant;
- whether funds, confidentiality, authorization or replay protection are affected.

Use testnet assets only when demonstrating a security issue.
