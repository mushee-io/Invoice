#!/usr/bin/env bash
set -euo pipefail
export PATH="$HOME/.local/bin:$PATH"

if ! command -v compact >/dev/null 2>&1; then
  curl --proto '=https' --tlsv1.2 --retry 5 --retry-all-errors --retry-delay 2 -LsSf \
    https://github.com/midnightntwrk/compact/releases/download/compact-v0.5.2/compact-installer.sh | sh
  export PATH="$HOME/.local/bin:$PATH"
fi

update_compact() {
  local attempt=1
  local max_attempts=5
  while (( attempt <= max_attempts )); do
    if compact update 0.31; then
      return 0
    fi
    if (( attempt == max_attempts )); then
      echo "Compact 0.31 compiler bootstrap failed after ${max_attempts} attempts." >&2
      return 1
    fi
    local delay=$(( attempt * 10 ))
    echo "Compact compiler bootstrap attempt ${attempt}/${max_attempts} failed; retrying in ${delay}s..." >&2
    sleep "$delay"
    attempt=$(( attempt + 1 ))
  done
}

update_compact
rm -rf contract/build
compact compile contract/invoice.compact contract/build

test -f contract/build/contract/index.js
for circuit in \
  createInvoice acceptInvoice cancelInvoice fundInvoice payInvoice approveInvoiceRefund refundInvoice \
  proveInvoiceExists proveInvoiceAccepted proveInvoicePaid proveAmountAtLeast \
  registerMilestone fundMilestone releaseMilestone approveMilestoneRefund refundMilestone \
  createAmountDisclosure createTaxDisclosure createDueDateDisclosure revokeDisclosure \
  createReceipt
do
  test -f "contract/build/keys/${circuit}.prover"
  test -f "contract/build/keys/${circuit}.verifier"
  test -f "contract/build/zkir/${circuit}.bzkir"
done

echo "BLACKOUT INVOICE protocol v2 Compact 0.31.x assets verified."
