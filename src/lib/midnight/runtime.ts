import { deployContract, findDeployedContract, submitCallTx } from "@midnight-ntwrk/midnight-js-contracts";
import type { ContractAddress } from "@midnight-ntwrk/midnight-js-protocol/compact-runtime";
import type { DisclosureArtifact, DisclosureField, InvoiceDraft, InvoiceStatus, MilestoneDraft, MilestoneStatus, ReceiptArtifact, ReceivableClaim } from "../invoice/types";
import { assertBytes32, assertInvoiceDraft, assertMilestoneDraft } from "../invoice/types";
import { bytesToHex, hexToBytes32, randomBytes32 } from "./bytes";
import { createCompiledInvoiceContract, type GeneratedInvoiceModule, type InvoiceLedgerView } from "./generated-contract";
import { buildInvoiceProviders, type InvoiceCircuitId, type InvoiceProviders } from "./providers";
import {
  INVOICE_PRIVATE_STATE_ID,
  activateFundedCoin,
  activateFundedMilestoneCoin,
  activateInvoice,
  activateMilestone,
  attachFundedCoin,
  attachFundedMilestoneCoin,
  createInitialInvoicePrivateState,
  fundedCoinCandidates,
  fundedMilestoneCoinCandidates,
  getInvoiceRecord,
  getMilestoneRecord,
  setInvoiceAuthority,
  upsertInvoiceRecord,
  upsertMilestoneRecord,
  type InvoicePrivateState,
} from "./private-state";
import { captureCommitmentCandidates } from "./settlement-indexer";
import { assertWalletStillConnected, type ConnectedWallet } from "./wallet";

type Runtime = {
  wallet: ConnectedWallet;
  providers: InvoiceProviders;
  generated: GeneratedInvoiceModule;
  compiledContract: any;
  contractAddress: ContractAddress;
};

let runtime: Runtime | undefined;

function equalBytes(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

function nonZeroBytes(value: Uint8Array) {
  return value.some((byte) => byte !== 0);
}

function requireRuntime() {
  if (!runtime) throw new Error("Blackout Invoice runtime is not initialized");
  return runtime;
}

function returnedBytes(result: unknown, label: string): Uint8Array {
  if (!(result instanceof Uint8Array)) throw new Error(`${label} circuit returned an invalid identifier`);
  return result;
}

async function getPrivateState(current: Runtime): Promise<InvoicePrivateState> {
  await assertWalletStillConnected(current.wallet);
  current.providers.privateStateProvider.setContractAddress(current.contractAddress);
  const state = await current.providers.privateStateProvider.get(INVOICE_PRIVATE_STATE_ID);
  if (!state) throw new Error("Encrypted invoice private state is missing");
  return state;
}

async function setPrivateState(current: Runtime, state: InvoicePrivateState) {
  current.providers.privateStateProvider.setContractAddress(current.contractAddress);
  await current.providers.privateStateProvider.set(INVOICE_PRIVATE_STATE_ID, state);
}

async function queryLedger(current: Runtime): Promise<InvoiceLedgerView | null> {
  await assertWalletStillConnected(current.wallet);
  const state = await current.providers.publicDataProvider.queryContractState(current.contractAddress);
  return state ? current.generated.ledger(state.data) : null;
}

async function confirm(current: Runtime, description: string, predicate: (value: InvoiceLedgerView) => boolean): Promise<InvoiceLedgerView> {
  let latest: InvoiceLedgerView | null = null;
  for (let attempt = 0; attempt < 24; attempt += 1) {
    latest = await queryLedger(current);
    if (latest && BigInt(latest.protocolVersion) === 2n && predicate(latest)) return latest;
    await new Promise((resolve) => window.setTimeout(resolve, 500));
  }
  if (!latest) throw new Error(`Midnight indexer did not return invoice state after ${description}`);
  throw new Error(`Invoice state did not confirm ${description}`);
}

async function submit(current: Runtime, circuitId: InvoiceCircuitId, args: unknown[]) {
  await assertWalletStillConnected(current.wallet);
  const result = await submitCallTx(current.providers as any, {
    compiledContract: current.compiledContract,
    contractAddress: current.contractAddress,
    circuitId,
    args,
    privateStateId: INVOICE_PRIVATE_STATE_ID,
  } as any);
  if (!result.public.txId) throw new Error(`Midnight returned no transaction ID for ${circuitId}`);
  return result as { public: { txId: string }; private: { result: unknown } };
}

function invoiceStatusLabel(current: Runtime, status: number): InvoiceStatus {
  if (status === current.generated.InvoiceStatus.Created) return "CREATED";
  if (status === current.generated.InvoiceStatus.Accepted) return "ACCEPTED";
  if (status === current.generated.InvoiceStatus.Funded) return "FUNDED";
  if (status === current.generated.InvoiceStatus.Paid) return "PAID";
  if (status === current.generated.InvoiceStatus.Cancelled) return "CANCELLED";
  if (status === current.generated.InvoiceStatus.Refunded) return "REFUNDED";
  throw new Error("Unknown invoice status");
}

function milestoneStatusLabel(current: Runtime, status: number): MilestoneStatus {
  if (status === current.generated.MilestoneStatus.Registered) return "REGISTERED";
  if (status === current.generated.MilestoneStatus.Funded) return "FUNDED";
  if (status === current.generated.MilestoneStatus.Released) return "RELEASED";
  if (status === current.generated.MilestoneStatus.Refunded) return "REFUNDED";
  throw new Error("Unknown milestone status");
}

export async function initializeInvoiceRuntime(params: {
  wallet: ConnectedWallet;
  privateStatePassword: string;
  mode: "deploy" | "join";
  contractAddress?: string;
}) {
  const providers = await buildInvoiceProviders(params.wallet, params.privateStatePassword);
  const { generated, compiledContract } = await createCompiledInvoiceContract();
  let contractAddress: ContractAddress;
  let deploymentTransactionId: string | undefined;

  if (params.mode === "deploy") {
    const deployed = await deployContract(providers as any, {
      compiledContract,
      privateStateId: INVOICE_PRIVATE_STATE_ID,
      initialPrivateState: createInitialInvoicePrivateState(),
    } as any);
    contractAddress = deployed.deployTxData.public.contractAddress;
    deploymentTransactionId = deployed.deployTxData.public.txId;
  } else {
    if (!params.contractAddress?.trim()) throw new Error("A deployed Blackout Invoice protocol v2 contract address is required");
    contractAddress = params.contractAddress.trim() as ContractAddress;
    providers.privateStateProvider.setContractAddress(contractAddress);
    const existing = await providers.privateStateProvider.get(INVOICE_PRIVATE_STATE_ID);
    await findDeployedContract(providers as any, {
      contractAddress,
      compiledContract,
      privateStateId: INVOICE_PRIVATE_STATE_ID,
      ...(existing ? {} : { initialPrivateState: createInitialInvoicePrivateState() }),
    } as any);
  }

  providers.privateStateProvider.setContractAddress(contractAddress);
  runtime = { wallet: params.wallet, providers, generated, compiledContract, contractAddress };
  await confirm(runtime, "protocol v2 runtime initialization", () => true);
  return { contractAddress: String(contractAddress), deploymentTransactionId };
}

export async function createAuthority() {
  const current = requireRuntime();
  const secret = randomBytes32();
  return {
    secretHex: bytesToHex(secret),
    publicKeyHex: bytesToHex(current.generated.pureCircuits.deriveAuthorityPublicKey(secret)),
  };
}

export async function createInvoiceOnChain(input: InvoiceDraft & { supplierSecretHex: string }) {
  const current = requireRuntime();
  assertInvoiceDraft(input);
  const invoiceId = hexToBytes32(input.invoiceIdHex);
  const tokenColor = hexToBytes32(input.tokenColorHex);
  let state = upsertInvoiceRecord(await getPrivateState(current), input.invoiceIdHex, input.witness);
  state = setInvoiceAuthority(state, input.invoiceIdHex, "supplier", input.supplierSecretHex);
  await setPrivateState(current, state);

  const expected = current.generated.pureCircuits.invoiceCommitment(
    invoiceId,
    input.witness.amountMinor,
    input.witness.taxMinor,
    hexToBytes32(input.witness.payerPublicKeyHex),
    hexToBytes32(input.witness.supplierPublicKeyHex),
    hexToBytes32(input.witness.payerCoinPublicKeyHex),
    hexToBytes32(input.witness.supplierCoinPublicKeyHex),
    input.witness.dueAt,
    hexToBytes32(input.witness.saltHex),
  );
  const result = await submit(current, "createInvoice", [invoiceId, tokenColor]);
  await confirm(current, "invoice creation", (value) =>
    value.invoices.member(invoiceId) &&
    value.invoices.lookup(invoiceId).status === current.generated.InvoiceStatus.Created &&
    equalBytes(value.invoices.lookup(invoiceId).commitment, expected),
  );
  return { transactionId: result.public.txId, commitmentHex: bytesToHex(expected) };
}

export async function acceptInvoiceOnChain(input: InvoiceDraft & { payerSecretHex: string }) {
  const current = requireRuntime();
  assertInvoiceDraft(input);
  const invoiceId = hexToBytes32(input.invoiceIdHex);
  let state = upsertInvoiceRecord(await getPrivateState(current), input.invoiceIdHex, input.witness);
  state = setInvoiceAuthority(state, input.invoiceIdHex, "payer", input.payerSecretHex);
  await setPrivateState(current, state);
  const result = await submit(current, "acceptInvoice", [invoiceId, randomBytes32()]);
  await confirm(current, "invoice acceptance", (value) => value.invoices.member(invoiceId) && value.invoices.lookup(invoiceId).status === current.generated.InvoiceStatus.Accepted);
  return { transactionId: result.public.txId };
}

export async function cancelInvoiceOnChain(input: { invoiceIdHex: string; supplierSecretHex: string }) {
  const current = requireRuntime();
  const invoiceId = hexToBytes32(input.invoiceIdHex);
  let state = activateInvoice(await getPrivateState(current), input.invoiceIdHex);
  state = setInvoiceAuthority(state, input.invoiceIdHex, "supplier", input.supplierSecretHex);
  await setPrivateState(current, state);
  const result = await submit(current, "cancelInvoice", [invoiceId, randomBytes32()]);
  await confirm(current, "invoice cancellation", (value) => value.invoices.member(invoiceId) && value.invoices.lookup(invoiceId).status === current.generated.InvoiceStatus.Cancelled);
  return { transactionId: result.public.txId };
}

export async function fundInvoiceOnChain(input: { invoiceIdHex: string; payerSecretHex: string }) {
  const current = requireRuntime();
  const invoiceId = hexToBytes32(input.invoiceIdHex);
  let state = activateInvoice(await getPrivateState(current), input.invoiceIdHex);
  state = setInvoiceAuthority(state, input.invoiceIdHex, "payer", input.payerSecretHex);
  await setPrivateState(current, state);
  const record = getInvoiceRecord(state, input.invoiceIdHex);
  const before = await confirm(current, "funding precheck", (value) => value.invoices.member(invoiceId));
  const entry = before.invoices.lookup(invoiceId);
  if (entry.status !== current.generated.InvoiceStatus.Accepted) throw new Error("Invoice is not ACCEPTED");
  const fundingCoin = { nonce: randomBytes32(), color: new Uint8Array(entry.tokenColor), value: record.amountMinor };
  const result = await submit(current, "fundInvoice", [invoiceId, fundingCoin]);
  await confirm(current, "invoice escrow funding", (value) => value.invoices.lookup(invoiceId).status === current.generated.InvoiceStatus.Funded);
  const candidates = await captureCommitmentCandidates(current.wallet.configuration.indexerUri, result.public.txId);
  state = attachFundedCoin(await getPrivateState(current), input.invoiceIdHex, {
    nonceHex: bytesToHex(fundingCoin.nonce),
    colorHex: bytesToHex(fundingCoin.color),
    value: fundingCoin.value,
    mtIndexCandidates: candidates,
  });
  await setPrivateState(current, state);
  return { transactionId: result.public.txId, candidateMtIndices: candidates.map(String) };
}

export async function approveInvoiceRefundOnChain(input: { invoiceIdHex: string; supplierSecretHex: string }) {
  const current = requireRuntime();
  const invoiceId = hexToBytes32(input.invoiceIdHex);
  let state = activateInvoice(await getPrivateState(current), input.invoiceIdHex);
  state = setInvoiceAuthority(state, input.invoiceIdHex, "supplier", input.supplierSecretHex);
  await setPrivateState(current, state);
  const result = await submit(current, "approveInvoiceRefund", [invoiceId, randomBytes32()]);
  const ledger = await confirm(current, "supplier refund approval", (value) => value.invoices.member(invoiceId) && nonZeroBytes(value.invoices.lookup(invoiceId).refundApprovalNullifier));
  return { transactionId: result.public.txId, approvalNullifierHex: bytesToHex(ledger.invoices.lookup(invoiceId).refundApprovalNullifier) };
}

async function spendWholeInvoiceEscrow(input: { invoiceIdHex: string; payerSecretHex: string; mode: "pay" | "refund" }) {
  const current = requireRuntime();
  const invoiceId = hexToBytes32(input.invoiceIdHex);
  let state = activateInvoice(await getPrivateState(current), input.invoiceIdHex);
  state = setInvoiceAuthority(state, input.invoiceIdHex, "payer", input.payerSecretHex);
  await setPrivateState(current, state);
  const candidates = fundedCoinCandidates(state, input.invoiceIdHex);
  if (!candidates.length) throw new Error("Funded invoice coin is unavailable");

  const before = await confirm(current, `${input.mode} precheck`, (value) => value.invoices.member(invoiceId));
  const entry = before.invoices.lookup(invoiceId);
  if (entry.status === current.generated.InvoiceStatus.Paid || entry.status === current.generated.InvoiceStatus.Refunded) throw new Error("Invoice escrow has already been consumed");
  if (entry.status !== current.generated.InvoiceStatus.Funded) throw new Error("Invoice is not FUNDED");
  if (input.mode === "refund" && !nonZeroBytes(entry.refundApprovalNullifier)) throw new Error("Supplier refund approval has not been recorded on-chain");

  const nonce = randomBytes32();
  let lastError: Error | undefined;
  for (const candidate of candidates) {
    try {
      state = activateFundedCoin(await getPrivateState(current), input.invoiceIdHex, candidate);
      state = setInvoiceAuthority(state, input.invoiceIdHex, "payer", input.payerSecretHex);
      await setPrivateState(current, state);
      const result = await submit(current, input.mode === "refund" ? "refundInvoice" : "payInvoice", [invoiceId, nonce]);
      const target = input.mode === "refund" ? current.generated.InvoiceStatus.Refunded : current.generated.InvoiceStatus.Paid;
      await confirm(current, input.mode === "refund" ? "invoice escrow refund" : "invoice settlement", (value) => value.invoices.lookup(invoiceId).status === target);
      return { transactionId: result.public.txId };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const latest = await queryLedger(current).catch(() => null);
      const target = input.mode === "refund" ? current.generated.InvoiceStatus.Refunded : current.generated.InvoiceStatus.Paid;
      if (latest?.invoices.member(invoiceId) && latest.invoices.lookup(invoiceId).status === target) {
        throw new Error(`Invoice ${input.mode === "refund" ? "refunded" : "settled"} on-chain but transaction ID recovery failed. Refresh before retrying.`);
      }
    }
  }
  throw lastError ?? new Error("No funded-coin commitment candidate could prove escrow spend");
}

export async function payInvoiceOnChain(input: { invoiceIdHex: string; payerSecretHex: string }) {
  return spendWholeInvoiceEscrow({ ...input, mode: "pay" });
}

export async function refundInvoiceOnChain(input: { invoiceIdHex: string; payerSecretHex: string }) {
  return spendWholeInvoiceEscrow({ ...input, mode: "refund" });
}

async function createReceivableProof(circuitId: "proveInvoiceExists" | "proveInvoiceAccepted" | "proveInvoicePaid", invoiceIdHex: string, claim: ReceivableClaim) {
  const current = requireRuntime();
  const invoiceId = hexToBytes32(invoiceIdHex);
  await setPrivateState(current, activateInvoice(await getPrivateState(current), invoiceIdHex));
  const result = await submit(current, circuitId, [invoiceId, randomBytes32()]);
  const proofId = returnedBytes(result.private.result, claim);
  await confirm(current, `${claim} receivable proof`, (value) => value.receivableProofs.member(proofId));
  return { transactionId: result.public.txId, proofIdHex: bytesToHex(proofId), claim };
}

export async function proveInvoiceExistsOnChain(invoiceIdHex: string) {
  return createReceivableProof("proveInvoiceExists", invoiceIdHex, "EXISTS");
}

export async function proveInvoiceAcceptedOnChain(invoiceIdHex: string) {
  return createReceivableProof("proveInvoiceAccepted", invoiceIdHex, "ACCEPTED");
}

export async function proveInvoicePaidOnChain(invoiceIdHex: string) {
  return createReceivableProof("proveInvoicePaid", invoiceIdHex, "PAID");
}

export async function proveAmountAtLeastOnChain(input: { invoiceIdHex: string; thresholdMinor: bigint }) {
  const current = requireRuntime();
  if (input.thresholdMinor <= 0n || input.thresholdMinor > ((1n << 64n) - 1n)) throw new Error("Proof threshold is outside Uint64 range");
  const invoiceId = hexToBytes32(input.invoiceIdHex);
  await setPrivateState(current, activateInvoice(await getPrivateState(current), input.invoiceIdHex));
  const result = await submit(current, "proveAmountAtLeast", [invoiceId, input.thresholdMinor, randomBytes32()]);
  const proofId = returnedBytes(result.private.result, "AMOUNT_AT_LEAST");
  await confirm(current, "amount-threshold receivable proof", (value) => value.receivableProofs.member(proofId) && value.receivableProofs.lookup(proofId).thresholdMinor === input.thresholdMinor);
  return { transactionId: result.public.txId, proofIdHex: bytesToHex(proofId), claim: "AMOUNT_AT_LEAST" as const, thresholdMinor: input.thresholdMinor };
}

export async function getReceivableProof(proofIdHex: string) {
  const current = requireRuntime();
  const proofId = hexToBytes32(proofIdHex, "receivable proof id");
  const ledger = await confirm(current, "receivable proof read", (value) => value.receivableProofs.member(proofId));
  const proof = ledger.receivableProofs.lookup(proofId);
  const claim = proof.claimCode === 1n ? "EXISTS" : proof.claimCode === 2n ? "ACCEPTED" : proof.claimCode === 4n ? "PAID" : proof.claimCode === 5n ? "AMOUNT_AT_LEAST" : "UNKNOWN";
  return { proofIdHex, invoiceIdHex: bytesToHex(proof.invoiceId), invoiceCommitmentHex: bytesToHex(proof.invoiceCommitment), claim, thresholdMinor: proof.thresholdMinor };
}

export async function registerMilestoneOnChain(input: MilestoneDraft & { supplierSecretHex: string }) {
  const current = requireRuntime();
  assertMilestoneDraft(input);
  const invoiceId = hexToBytes32(input.invoiceIdHex);
  let state = upsertMilestoneRecord(await getPrivateState(current), input.invoiceIdHex, input.index, input.witness);
  state = activateMilestone(state, input.invoiceIdHex, input.index);
  state = setInvoiceAuthority(state, input.invoiceIdHex, "supplier", input.supplierSecretHex);
  await setPrivateState(current, state);
  const expectedId = current.generated.pureCircuits.milestoneId(invoiceId, BigInt(input.index));
  const expectedCommitment = current.generated.pureCircuits.milestoneCommitment(invoiceId, BigInt(input.index), input.witness.amountMinor, hexToBytes32(input.witness.saltHex));
  const result = await submit(current, "registerMilestone", [invoiceId, BigInt(input.index)]);
  await confirm(current, "milestone registration", (value) => value.milestones.member(expectedId) && value.milestones.lookup(expectedId).status === current.generated.MilestoneStatus.Registered && equalBytes(value.milestones.lookup(expectedId).commitment, expectedCommitment));
  return { transactionId: result.public.txId, milestoneIdHex: bytesToHex(expectedId), commitmentHex: bytesToHex(expectedCommitment) };
}

export async function fundMilestoneOnChain(input: { invoiceIdHex: string; index: number; payerSecretHex: string }) {
  const current = requireRuntime();
  const invoiceId = hexToBytes32(input.invoiceIdHex);
  let state = activateMilestone(activateInvoice(await getPrivateState(current), input.invoiceIdHex), input.invoiceIdHex, input.index);
  state = setInvoiceAuthority(state, input.invoiceIdHex, "payer", input.payerSecretHex);
  await setPrivateState(current, state);
  const record = getMilestoneRecord(state, input.invoiceIdHex, input.index);
  const milestoneId = current.generated.pureCircuits.milestoneId(invoiceId, BigInt(input.index));
  const before = await confirm(current, "milestone funding precheck", (value) => value.milestones.member(milestoneId));
  const milestone = before.milestones.lookup(milestoneId);
  if (milestone.status !== current.generated.MilestoneStatus.Registered) throw new Error("Milestone is not REGISTERED");
  const fundingCoin = { nonce: randomBytes32(), color: new Uint8Array(milestone.tokenColor), value: record.amountMinor };
  const result = await submit(current, "fundMilestone", [invoiceId, BigInt(input.index), fundingCoin]);
  await confirm(current, "milestone escrow funding", (value) => value.milestones.lookup(milestoneId).status === current.generated.MilestoneStatus.Funded);
  const candidates = await captureCommitmentCandidates(current.wallet.configuration.indexerUri, result.public.txId);
  state = attachFundedMilestoneCoin(await getPrivateState(current), input.invoiceIdHex, input.index, {
    nonceHex: bytesToHex(fundingCoin.nonce),
    colorHex: bytesToHex(fundingCoin.color),
    value: fundingCoin.value,
    mtIndexCandidates: candidates,
  });
  await setPrivateState(current, state);
  return { transactionId: result.public.txId, candidateMtIndices: candidates.map(String) };
}

export async function approveMilestoneRefundOnChain(input: { invoiceIdHex: string; index: number; supplierSecretHex: string }) {
  const current = requireRuntime();
  const invoiceId = hexToBytes32(input.invoiceIdHex);
  let state = activateMilestone(activateInvoice(await getPrivateState(current), input.invoiceIdHex), input.invoiceIdHex, input.index);
  state = setInvoiceAuthority(state, input.invoiceIdHex, "supplier", input.supplierSecretHex);
  await setPrivateState(current, state);
  const milestoneId = current.generated.pureCircuits.milestoneId(invoiceId, BigInt(input.index));
  const result = await submit(current, "approveMilestoneRefund", [invoiceId, BigInt(input.index), randomBytes32()]);
  const ledger = await confirm(current, "supplier milestone refund approval", (value) => value.milestones.member(milestoneId) && nonZeroBytes(value.milestones.lookup(milestoneId).refundApprovalNullifier));
  return { transactionId: result.public.txId, milestoneIdHex: bytesToHex(milestoneId), approvalNullifierHex: bytesToHex(ledger.milestones.lookup(milestoneId).refundApprovalNullifier) };
}

async function spendMilestoneEscrow(input: { invoiceIdHex: string; index: number; payerSecretHex: string; mode: "release" | "refund" }) {
  const current = requireRuntime();
  const invoiceId = hexToBytes32(input.invoiceIdHex);
  let state = activateMilestone(activateInvoice(await getPrivateState(current), input.invoiceIdHex), input.invoiceIdHex, input.index);
  state = setInvoiceAuthority(state, input.invoiceIdHex, "payer", input.payerSecretHex);
  await setPrivateState(current, state);
  const candidates = fundedMilestoneCoinCandidates(state, input.invoiceIdHex, input.index);
  if (!candidates.length) throw new Error("Funded milestone coin is unavailable");
  const milestoneId = current.generated.pureCircuits.milestoneId(invoiceId, BigInt(input.index));
  const before = await confirm(current, "milestone escrow spend precheck", (value) => value.milestones.member(milestoneId));
  const milestone = before.milestones.lookup(milestoneId);
  if (milestone.status === current.generated.MilestoneStatus.Released || milestone.status === current.generated.MilestoneStatus.Refunded) throw new Error("Milestone escrow has already been consumed");
  if (milestone.status !== current.generated.MilestoneStatus.Funded) throw new Error("Milestone is not FUNDED");
  if (input.mode === "refund" && !nonZeroBytes(milestone.refundApprovalNullifier)) throw new Error("Supplier milestone refund approval has not been recorded on-chain");

  const nonce = randomBytes32();
  let lastError: Error | undefined;
  for (const candidate of candidates) {
    try {
      state = activateFundedMilestoneCoin(await getPrivateState(current), input.invoiceIdHex, input.index, candidate);
      state = activateMilestone(state, input.invoiceIdHex, input.index);
      state = setInvoiceAuthority(state, input.invoiceIdHex, "payer", input.payerSecretHex);
      await setPrivateState(current, state);
      const result = await submit(current, input.mode === "refund" ? "refundMilestone" : "releaseMilestone", [invoiceId, BigInt(input.index), nonce]);
      const target = input.mode === "refund" ? current.generated.MilestoneStatus.Refunded : current.generated.MilestoneStatus.Released;
      await confirm(current, `${input.mode} milestone escrow`, (value) => value.milestones.lookup(milestoneId).status === target);
      return { transactionId: result.public.txId, milestoneIdHex: bytesToHex(milestoneId) };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const latest = await queryLedger(current).catch(() => null);
      const target = input.mode === "refund" ? current.generated.MilestoneStatus.Refunded : current.generated.MilestoneStatus.Released;
      if (latest?.milestones.member(milestoneId) && latest.milestones.lookup(milestoneId).status === target) throw new Error(`Milestone ${input.mode} confirmed on-chain but transaction ID recovery failed. Refresh before retrying.`);
    }
  }
  throw lastError ?? new Error("No funded milestone commitment candidate could prove escrow spend");
}

export async function releaseMilestoneOnChain(input: { invoiceIdHex: string; index: number; payerSecretHex: string }) {
  return spendMilestoneEscrow({ ...input, mode: "release" });
}

export async function refundMilestoneOnChain(input: { invoiceIdHex: string; index: number; payerSecretHex: string }) {
  return spendMilestoneEscrow({ ...input, mode: "refund" });
}

export async function getMilestoneStatus(invoiceIdHex: string, index: number): Promise<MilestoneStatus> {
  const current = requireRuntime();
  const invoiceId = hexToBytes32(invoiceIdHex);
  const milestoneId = current.generated.pureCircuits.milestoneId(invoiceId, BigInt(index));
  const state = await confirm(current, "milestone status read", (value) => value.milestones.member(milestoneId));
  return milestoneStatusLabel(current, state.milestones.lookup(milestoneId).status);
}

export async function createSelectiveDisclosureOnChain(input: {
  invoiceIdHex: string;
  supplierSecretHex: string;
  field: DisclosureField;
  verifierIdHex: string;
  expiresAt: bigint;
}): Promise<DisclosureArtifact> {
  const current = requireRuntime();
  assertBytes32(input.verifierIdHex, "Verifier identifier");
  if (input.expiresAt <= BigInt(Math.floor(Date.now() / 1000))) throw new Error("Disclosure expiry must be in the future");
  const invoiceId = hexToBytes32(input.invoiceIdHex);
  const verifierId = hexToBytes32(input.verifierIdHex);
  let state = activateInvoice(await getPrivateState(current), input.invoiceIdHex);
  state = setInvoiceAuthority(state, input.invoiceIdHex, "supplier", input.supplierSecretHex);
  await setPrivateState(current, state);
  const record = getInvoiceRecord(state, input.invoiceIdHex);
  const opening = randomBytes32();
  const nonce = randomBytes32();
  const config = input.field === "AMOUNT"
    ? { circuit: "createAmountDisclosure" as const, value: record.amountMinor, commitment: current.generated.pureCircuits.amountDisclosureCommitment(record.amountMinor, opening) }
    : input.field === "TAX"
      ? { circuit: "createTaxDisclosure" as const, value: record.taxMinor, commitment: current.generated.pureCircuits.taxDisclosureCommitment(record.taxMinor, opening) }
      : { circuit: "createDueDateDisclosure" as const, value: record.dueAt, commitment: current.generated.pureCircuits.dueDateDisclosureCommitment(record.dueAt, opening) };
  const result = await submit(current, config.circuit, [invoiceId, verifierId, input.expiresAt, opening, nonce]);
  const disclosureId = returnedBytes(result.private.result, `${input.field} disclosure`);
  await confirm(current, "selective disclosure", (value) => value.disclosures.member(disclosureId) && !value.disclosures.lookup(disclosureId).revoked && equalBytes(value.disclosures.lookup(disclosureId).fieldCommitment, config.commitment));
  return {
    disclosureIdHex: bytesToHex(disclosureId),
    invoiceIdHex: bytesToHex(invoiceId),
    field: input.field,
    valueMinor: config.value,
    openingHex: bytesToHex(opening),
    verifierIdHex: bytesToHex(verifierId),
    expiresAt: input.expiresAt,
    fieldCommitmentHex: bytesToHex(config.commitment),
    transactionId: result.public.txId,
  };
}

export async function verifyDisclosureArtifactOnChain(artifact: DisclosureArtifact) {
  const current = requireRuntime();
  const disclosureId = hexToBytes32(artifact.disclosureIdHex, "disclosure id");
  const ledger = await confirm(current, "disclosure verification", (value) => value.disclosures.member(disclosureId));
  const stored = ledger.disclosures.lookup(disclosureId);
  const opening = hexToBytes32(artifact.openingHex, "disclosure opening");
  const expected = artifact.field === "AMOUNT"
    ? current.generated.pureCircuits.amountDisclosureCommitment(artifact.valueMinor, opening)
    : artifact.field === "TAX"
      ? current.generated.pureCircuits.taxDisclosureCommitment(artifact.valueMinor, opening)
      : current.generated.pureCircuits.dueDateDisclosureCommitment(artifact.valueMinor, opening);
  const fieldCode = artifact.field === "AMOUNT" ? 1n : artifact.field === "TAX" ? 2n : 3n;
  const nowSeconds = BigInt(Math.floor(Date.now() / 1000));
  const valid = !stored.revoked && stored.fieldCode === fieldCode && stored.expiresAt === artifact.expiresAt &&
    equalBytes(stored.invoiceId, hexToBytes32(artifact.invoiceIdHex)) && equalBytes(stored.verifierId, hexToBytes32(artifact.verifierIdHex)) &&
    equalBytes(stored.fieldCommitment, expected) && bytesToHex(expected) === artifact.fieldCommitmentHex.toLowerCase() && artifact.expiresAt > nowSeconds;
  return { valid, revoked: stored.revoked, expiredLocally: artifact.expiresAt <= nowSeconds, invoiceCommitmentHex: bytesToHex(stored.invoiceCommitment) };
}

export async function revokeDisclosureOnChain(input: { invoiceIdHex: string; disclosureIdHex: string; supplierSecretHex: string }) {
  const current = requireRuntime();
  const invoiceId = hexToBytes32(input.invoiceIdHex);
  const disclosureId = hexToBytes32(input.disclosureIdHex, "disclosure id");
  let state = activateInvoice(await getPrivateState(current), input.invoiceIdHex);
  state = setInvoiceAuthority(state, input.invoiceIdHex, "supplier", input.supplierSecretHex);
  await setPrivateState(current, state);
  const result = await submit(current, "revokeDisclosure", [invoiceId, disclosureId]);
  await confirm(current, "disclosure revocation", (value) => value.disclosures.member(disclosureId) && value.disclosures.lookup(disclosureId).revoked);
  return { transactionId: result.public.txId };
}

export async function createReceiptOnChain(input: { invoiceIdHex: string; supplierSecretHex: string; verifierIdHex: string }): Promise<ReceiptArtifact> {
  const current = requireRuntime();
  assertBytes32(input.verifierIdHex, "Verifier identifier");
  const invoiceId = hexToBytes32(input.invoiceIdHex);
  const verifierId = hexToBytes32(input.verifierIdHex);
  let state = activateInvoice(await getPrivateState(current), input.invoiceIdHex);
  state = setInvoiceAuthority(state, input.invoiceIdHex, "supplier", input.supplierSecretHex);
  await setPrivateState(current, state);
  const result = await submit(current, "createReceipt", [invoiceId, verifierId, randomBytes32()]);
  const receiptId = returnedBytes(result.private.result, "receipt");
  const ledger = await confirm(current, "private receipt creation", (value) => value.receipts.member(receiptId));
  const receipt = ledger.receipts.lookup(receiptId);
  return {
    receiptIdHex: bytesToHex(receiptId),
    invoiceIdHex: bytesToHex(receipt.invoiceId),
    verifierIdHex: bytesToHex(receipt.verifierId),
    invoiceCommitmentHex: bytesToHex(receipt.invoiceCommitment),
    paymentNullifierHex: bytesToHex(receipt.paymentNullifier),
    transactionId: result.public.txId,
  };
}

export async function verifyReceiptOnChain(artifact: ReceiptArtifact) {
  const current = requireRuntime();
  const receiptId = hexToBytes32(artifact.receiptIdHex, "receipt id");
  const invoiceId = hexToBytes32(artifact.invoiceIdHex);
  const ledger = await confirm(current, "receipt verification", (value) => value.receipts.member(receiptId) && value.invoices.member(invoiceId));
  const receipt = ledger.receipts.lookup(receiptId);
  const invoice = ledger.invoices.lookup(invoiceId);
  const valid = invoice.status === current.generated.InvoiceStatus.Paid &&
    equalBytes(receipt.invoiceId, invoiceId) && equalBytes(receipt.invoiceCommitment, invoice.commitment) && equalBytes(receipt.paymentNullifier, invoice.paymentNullifier) &&
    bytesToHex(receipt.invoiceCommitment) === artifact.invoiceCommitmentHex.toLowerCase() && bytesToHex(receipt.paymentNullifier) === artifact.paymentNullifierHex.toLowerCase() &&
    bytesToHex(receipt.verifierId) === artifact.verifierIdHex.toLowerCase();
  return { valid, status: invoiceStatusLabel(current, invoice.status), invoiceCommitmentHex: bytesToHex(invoice.commitment) };
}

export async function getInvoiceStatus(invoiceIdHex: string): Promise<InvoiceStatus> {
  const current = requireRuntime();
  const invoiceId = hexToBytes32(invoiceIdHex);
  const state = await confirm(current, "status read", (value) => value.invoices.member(invoiceId));
  return invoiceStatusLabel(current, state.invoices.lookup(invoiceId).status);
}
