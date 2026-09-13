import type { InstitutionalPolicySet } from "./policies";
import { assertInstitutionalPreflight } from "./policies";
import { fundInvoiceOnChain, fundMilestoneOnChain } from "../midnight/runtime";

export async function fundInvoiceWithPolicies(input: {
  invoiceIdHex: string;
  payerSecretHex: string;
  policy?: InstitutionalPolicySet;
}) {
  const evidence = await assertInstitutionalPreflight(input.policy);
  const result = await fundInvoiceOnChain({ invoiceIdHex: input.invoiceIdHex, payerSecretHex: input.payerSecretHex });
  return { ...result, institutionalEvidence: evidence };
}

export async function fundMilestoneWithPolicies(input: {
  invoiceIdHex: string;
  index: number;
  payerSecretHex: string;
  policy?: InstitutionalPolicySet;
}) {
  const evidence = await assertInstitutionalPreflight(input.policy);
  const result = await fundMilestoneOnChain({ invoiceIdHex: input.invoiceIdHex, index: input.index, payerSecretHex: input.payerSecretHex });
  return { ...result, institutionalEvidence: evidence };
}
