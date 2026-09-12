import { deployContract, findDeployedContract, submitCallTx } from "@midnight-ntwrk/midnight-js-contracts";
import type { ContractAddress } from "@midnight-ntwrk/midnight-js-protocol/compact-runtime";
import type { InvoiceDraft } from "../invoice/types";
import { assertInvoiceDraft } from "../invoice/types";
import { bytesToHex, hexToBytes32, randomBytes32 } from "./bytes";
import { createCompiledInvoiceContract, type GeneratedInvoiceModule, type InvoiceLedgerView } from "./generated-contract";
import { buildInvoiceProviders, type InvoiceCircuitId, type InvoiceProviders } from "./providers";
import { INVOICE_PRIVATE_STATE_ID, activateFundedCoin, activateInvoice, attachFundedCoin, createInitialInvoicePrivateState, fundedCoinCandidates, getInvoiceRecord, setInvoiceAuthority, upsertInvoiceRecord, type InvoicePrivateState } from "./private-state";
import { captureCommitmentCandidates } from "./settlement-indexer";
import { assertWalletStillConnected, type ConnectedWallet } from "./wallet";

type Runtime = { wallet: ConnectedWallet; providers: InvoiceProviders; generated: GeneratedInvoiceModule; compiledContract: any; contractAddress: ContractAddress };
let runtime: Runtime | undefined;

function equalBytes(a: Uint8Array, b: Uint8Array) { if (a.length !== b.length) return false; let diff = 0; for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]; return diff === 0; }
function requireRuntime() { if (!runtime) throw new Error("Blackout Invoice runtime is not initialized"); return runtime; }

async function getPrivateState(current: Runtime): Promise<InvoicePrivateState> {
  await assertWalletStillConnected(current.wallet); current.providers.privateStateProvider.setContractAddress(current.contractAddress);
  const state = await current.providers.privateStateProvider.get(INVOICE_PRIVATE_STATE_ID); if (!state) throw new Error("Encrypted invoice private state is missing"); return state;
}
async function setPrivateState(current: Runtime, state: InvoicePrivateState) { current.providers.privateStateProvider.setContractAddress(current.contractAddress); await current.providers.privateStateProvider.set(INVOICE_PRIVATE_STATE_ID, state); }
async function queryLedger(current: Runtime): Promise<InvoiceLedgerView | null> { await assertWalletStillConnected(current.wallet); const state = await current.providers.publicDataProvider.queryContractState(current.contractAddress); return state ? current.generated.ledger(state.data) : null; }
async function confirm(current: Runtime, description: string, predicate: (v: InvoiceLedgerView) => boolean): Promise<InvoiceLedgerView> {
  let latest: InvoiceLedgerView | null = null;
  for (let attempt = 0; attempt < 24; attempt++) { latest = await queryLedger(current); if (latest && BigInt(latest.protocolVersion) === 1n && predicate(latest)) return latest; await new Promise(resolve => window.setTimeout(resolve, 500)); }
  if (!latest) throw new Error(`Midnight indexer did not return invoice state after ${description}`); throw new Error(`Invoice state did not confirm ${description}`);
}
async function submit(current: Runtime, circuitId: InvoiceCircuitId, args: unknown[]) {
  await assertWalletStillConnected(current.wallet);
  const result = await submitCallTx(current.providers as any, { compiledContract: current.compiledContract, contractAddress: current.contractAddress, circuitId, args, privateStateId: INVOICE_PRIVATE_STATE_ID } as any);
  if (!result.public.txId) throw new Error(`Midnight returned no transaction ID for ${circuitId}`);
  return result as { public: { txId: string }; private: { result: unknown } };
}

export async function initializeInvoiceRuntime(params: { wallet: ConnectedWallet; privateStatePassword: string; mode: "deploy" | "join"; contractAddress?: string }) {
  const providers = await buildInvoiceProviders(params.wallet, params.privateStatePassword);
  const { generated, compiledContract } = await createCompiledInvoiceContract();
  let contractAddress: ContractAddress; let deploymentTransactionId: string | undefined;
  if (params.mode === "deploy") {
    const deployed = await deployContract(providers as any, { compiledContract, privateStateId: INVOICE_PRIVATE_STATE_ID, initialPrivateState: createInitialInvoicePrivateState() } as any);
    contractAddress = deployed.deployTxData.public.contractAddress; deploymentTransactionId = deployed.deployTxData.public.txId;
  } else {
    if (!params.contractAddress?.trim()) throw new Error("A deployed Blackout Invoice contract address is required");
    contractAddress = params.contractAddress.trim() as ContractAddress; providers.privateStateProvider.setContractAddress(contractAddress);
    const existing = await providers.privateStateProvider.get(INVOICE_PRIVATE_STATE_ID);
    await findDeployedContract(providers as any, { contractAddress, compiledContract, privateStateId: INVOICE_PRIVATE_STATE_ID, ...(existing ? {} : { initialPrivateState: createInitialInvoicePrivateState() }) } as any);
  }
  providers.privateStateProvider.setContractAddress(contractAddress);
  runtime = { wallet: params.wallet, providers, generated, compiledContract, contractAddress };
  await confirm(runtime, "runtime initialization", () => true);
  return { contractAddress: String(contractAddress), deploymentTransactionId };
}

export async function createAuthority() {
  const current = requireRuntime(); const secret = randomBytes32();
  return { secretHex: bytesToHex(secret), publicKeyHex: bytesToHex(current.generated.pureCircuits.deriveAuthorityPublicKey(secret)) };
}

export async function createInvoiceOnChain(input: InvoiceDraft & { supplierSecretHex: string }) {
  const current = requireRuntime(); assertInvoiceDraft(input); const invoiceId = hexToBytes32(input.invoiceIdHex), tokenColor = hexToBytes32(input.tokenColorHex);
  let state = upsertInvoiceRecord(await getPrivateState(current), input.invoiceIdHex, input.witness); state = setInvoiceAuthority(state, input.invoiceIdHex, "supplier", input.supplierSecretHex); await setPrivateState(current, state);
  const expected = current.generated.pureCircuits.invoiceCommitment(invoiceId, input.witness.amountMinor, input.witness.taxMinor, hexToBytes32(input.witness.payerPublicKeyHex), hexToBytes32(input.witness.supplierPublicKeyHex), hexToBytes32(input.witness.supplierCoinPublicKeyHex), input.witness.dueAt, hexToBytes32(input.witness.saltHex));
  const result = await submit(current, "createInvoice", [invoiceId, tokenColor]);
  await confirm(current, "invoice creation", v => v.invoices.member(invoiceId) && v.invoices.lookup(invoiceId).status === current.generated.InvoiceStatus.Created && equalBytes(v.invoices.lookup(invoiceId).commitment, expected));
  return { transactionId: result.public.txId, commitmentHex: bytesToHex(expected) };
}

export async function acceptInvoiceOnChain(input: InvoiceDraft & { payerSecretHex: string }) {
  const current = requireRuntime(); assertInvoiceDraft(input); const invoiceId = hexToBytes32(input.invoiceIdHex);
  let state = upsertInvoiceRecord(await getPrivateState(current), input.invoiceIdHex, input.witness); state = setInvoiceAuthority(state, input.invoiceIdHex, "payer", input.payerSecretHex); await setPrivateState(current, state);
  const result = await submit(current, "acceptInvoice", [invoiceId, randomBytes32()]);
  await confirm(current, "invoice acceptance", v => v.invoices.member(invoiceId) && v.invoices.lookup(invoiceId).status === current.generated.InvoiceStatus.Accepted);
  return { transactionId: result.public.txId };
}

export async function fundInvoiceOnChain(input: { invoiceIdHex: string; payerSecretHex: string }) {
  const current = requireRuntime(); const invoiceId = hexToBytes32(input.invoiceIdHex);
  let state = activateInvoice(await getPrivateState(current), input.invoiceIdHex); state = setInvoiceAuthority(state, input.invoiceIdHex, "payer", input.payerSecretHex); await setPrivateState(current, state);
  const record = getInvoiceRecord(state, input.invoiceIdHex); const before = await confirm(current, "funding precheck", v => v.invoices.member(invoiceId)); const entry = before.invoices.lookup(invoiceId);
  if (entry.status !== current.generated.InvoiceStatus.Accepted) throw new Error("Invoice is not ACCEPTED");
  const fundingCoin = { nonce: randomBytes32(), color: new Uint8Array(entry.tokenColor), value: record.amountMinor };
  const result = await submit(current, "fundInvoice", [invoiceId, fundingCoin]);
  await confirm(current, "invoice funding", v => v.invoices.lookup(invoiceId).status === current.generated.InvoiceStatus.Funded);
  const candidates = await captureCommitmentCandidates(current.wallet.configuration.indexerUri, result.public.txId);
  state = attachFundedCoin(await getPrivateState(current), input.invoiceIdHex, { nonceHex: bytesToHex(fundingCoin.nonce), colorHex: bytesToHex(fundingCoin.color), value: fundingCoin.value, mtIndexCandidates: candidates }); await setPrivateState(current, state);
  return { transactionId: result.public.txId, candidateMtIndices: candidates.map(String) };
}

export async function payInvoiceOnChain(input: { invoiceIdHex: string; payerSecretHex: string }) {
  const current = requireRuntime(); const invoiceId = hexToBytes32(input.invoiceIdHex);
  let state = activateInvoice(await getPrivateState(current), input.invoiceIdHex); state = setInvoiceAuthority(state, input.invoiceIdHex, "payer", input.payerSecretHex); await setPrivateState(current, state);
  const candidates = fundedCoinCandidates(state, input.invoiceIdHex); if (!candidates.length) throw new Error("Funded invoice coin is unavailable");
  const before = await confirm(current, "payment precheck", v => v.invoices.member(invoiceId)); const currentStatus = before.invoices.lookup(invoiceId).status;
  if (currentStatus === current.generated.InvoiceStatus.Paid) throw new Error("Invoice is already PAID on-chain"); if (currentStatus !== current.generated.InvoiceStatus.Funded) throw new Error("Invoice is not FUNDED");
  const nonce = randomBytes32(); let lastError: Error | undefined;
  for (const candidate of candidates) {
    try {
      state = activateFundedCoin(await getPrivateState(current), input.invoiceIdHex, candidate); state = setInvoiceAuthority(state, input.invoiceIdHex, "payer", input.payerSecretHex); await setPrivateState(current, state);
      const result = await submit(current, "payInvoice", [invoiceId, nonce]);
      await confirm(current, "invoice settlement", v => v.invoices.lookup(invoiceId).status === current.generated.InvoiceStatus.Paid);
      return { transactionId: result.public.txId };
    } catch (error) { lastError = error instanceof Error ? error : new Error(String(error)); const latest = await queryLedger(current).catch(() => null); if (latest?.invoices.member(invoiceId) && latest.invoices.lookup(invoiceId).status === current.generated.InvoiceStatus.Paid) throw new Error("Invoice settled on-chain but transaction ID recovery failed. Refresh before retrying."); }
  }
  throw lastError ?? new Error("No funded-coin commitment candidate could prove settlement");
}

export async function getInvoiceStatus(invoiceIdHex: string): Promise<"CREATED" | "ACCEPTED" | "FUNDED" | "PAID"> {
  const current = requireRuntime(); const invoiceId = hexToBytes32(invoiceIdHex); const state = await confirm(current, "status read", v => v.invoices.member(invoiceId)); const status = state.invoices.lookup(invoiceId).status;
  if (status === current.generated.InvoiceStatus.Created) return "CREATED"; if (status === current.generated.InvoiceStatus.Accepted) return "ACCEPTED"; if (status === current.generated.InvoiceStatus.Funded) return "FUNDED"; if (status === current.generated.InvoiceStatus.Paid) return "PAID"; throw new Error("Unknown invoice status");
}
