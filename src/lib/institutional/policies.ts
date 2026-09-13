export type PolicyKind = "BLACKOUT_VERIFY" | "BLACKOUT_SAFE";

export type PolicyEvidence = {
  valid: boolean;
  evidenceId: string;
  checkedAt: number;
  source: string;
  detail?: string;
};

export type VerifyPolicyRequirement = {
  kind: "BLACKOUT_VERIFY";
  invoiceCommitmentHex: string;
  claimCommitmentHex: string;
};

export type SafePolicyRequirement = {
  kind: "BLACKOUT_SAFE";
  invoiceCommitmentHex: string;
  policyCommitmentHex: string;
  requiredApprovals: number;
};

export type InstitutionalPolicyRequirement = VerifyPolicyRequirement | SafePolicyRequirement;

export type InstitutionalPolicySet = {
  requirements: InstitutionalPolicyRequirement[];
};

export type PolicyAdapter = {
  readonly name: string;
  verify(requirement: InstitutionalPolicyRequirement): Promise<PolicyEvidence>;
};

type AdapterRegistry = Partial<Record<PolicyKind, PolicyAdapter>>;

let adapters: AdapterRegistry = {};

const BYTES32 = /^(?:0x)?[0-9a-f]{64}$/i;
const ZERO_BYTES32 = /^(?:0x)?0{64}$/i;

function assertCommitment(value: string, label: string): void {
  if (!BYTES32.test(value) || ZERO_BYTES32.test(value)) throw new Error(`${label} must be a non-zero 32-byte hex commitment`);
}

export function validatePolicyRequirement(requirement: InstitutionalPolicyRequirement): void {
  assertCommitment(requirement.invoiceCommitmentHex, "Invoice commitment");
  if (requirement.kind === "BLACKOUT_VERIFY") {
    assertCommitment(requirement.claimCommitmentHex, "Verification claim commitment");
    return;
  }
  assertCommitment(requirement.policyCommitmentHex, "Treasury policy commitment");
  if (!Number.isInteger(requirement.requiredApprovals) || requirement.requiredApprovals < 1 || requirement.requiredApprovals > 5) {
    throw new Error("Treasury required approvals must be an integer between 1 and 5");
  }
}

export function setInstitutionalPolicyAdapter(kind: PolicyKind, adapter: PolicyAdapter): void {
  if (!adapter?.name?.trim() || typeof adapter.verify !== "function") throw new Error("Policy adapter is invalid");
  adapters = { ...adapters, [kind]: adapter };
}

export function clearInstitutionalPolicyAdapters(): void {
  adapters = {};
}

export function institutionalPolicyAdapterStatus(): Record<PolicyKind, { configured: boolean; name?: string }> {
  return {
    BLACKOUT_VERIFY: { configured: Boolean(adapters.BLACKOUT_VERIFY), name: adapters.BLACKOUT_VERIFY?.name },
    BLACKOUT_SAFE: { configured: Boolean(adapters.BLACKOUT_SAFE), name: adapters.BLACKOUT_SAFE?.name },
  };
}

export async function assertInstitutionalPreflight(policy?: InstitutionalPolicySet): Promise<PolicyEvidence[]> {
  if (!policy?.requirements?.length) return [];
  if (policy.requirements.length > 8) throw new Error("Institutional policy set exceeds the maximum of 8 requirements");

  const seen = new Set<string>();
  const evidence: PolicyEvidence[] = [];
  for (const requirement of policy.requirements) {
    validatePolicyRequirement(requirement);
    const key = JSON.stringify(requirement);
    if (seen.has(key)) throw new Error(`Duplicate ${requirement.kind} requirement`);
    seen.add(key);

    const adapter = adapters[requirement.kind];
    if (!adapter) throw new Error(`${requirement.kind} is required but no real policy adapter is configured`);
    const result = await adapter.verify(requirement);
    if (!result || result.valid !== true || !result.evidenceId?.trim() || !Number.isFinite(result.checkedAt)) {
      throw new Error(`${requirement.kind} adapter returned invalid or incomplete evidence`);
    }
    if (Math.abs(Date.now() - result.checkedAt) > 5 * 60_000) {
      throw new Error(`${requirement.kind} evidence is stale; refresh policy verification before funding`);
    }
    evidence.push(result);
  }
  return evidence;
}
