# Privacy model

Public: invoice commitment, token colour, lifecycle state, acceptance/payment nullifiers.

Private witness: exact amount, tax, payer/supplier authority, supplier payout key, due date, salt and funded-coin witness.

The contract verifies private witness data against the registered commitment. Network timing metadata may still permit correlation; this project does not claim network-layer anonymity.
