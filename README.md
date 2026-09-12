# BLACKOUT INVOICE

**Get paid. Prove it happened. Reveal nothing else.**

BLACKOUT INVOICE is a confidential commercial settlement protocol built for Midnight.

Milestones 1–5 implemented in this repo:
1. Foundation and deterministic invoice state machine
2. Private invoice witness model + commitments
3. Compact contract + payer/supplier authority + replay protection
4. Lace/Midnight runtime with delegated proving and indexer confirmation
5. Contract-bound shielded funding and settlement

LIVE mode fails closed. The UI never marks an invoice paid until Midnight state confirms `Paid`.
