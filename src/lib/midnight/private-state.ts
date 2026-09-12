import { levelPrivateStateProvider } from "@midnight-ntwrk/midnight-js-level-private-state-provider";
import type { PrivateStateProvider } from "@midnight-ntwrk/midnight-js-types";
import { assertInvoiceWitness, assertMilestoneDraft, assertNonZeroBytes32, type PrivateInvoiceWitness, type PrivateMilestoneWitness } from "../invoice/types";
import { bytesToHex, hexToBytes32 } from "./bytes";

export const INVOICE_PRIVATE_STATE_ID = "blackoutInvoicePrivateState" as const;

type InvoiceRecord = {
  amountMinor: bigint;
  taxMinor: bigint;
  payerPublicKey: Uint8Array;
  supplierPublicKey: Uint8Array;
  payerCoinPublicKey: Uint8Array;
  supplierCoinPublicKey: Uint8Array;
  dueAt: bigint;
  salt: Uint8Array;
};

type MilestoneRecord = { amountMinor: bigint; salt: Uint8Array };
type FundedCoin = { nonce: Uint8Array; color: Uint8Array; value: bigint; mtIndexCandidates: bigint[]; activeMtIndex?: bigint };

export type InvoicePrivateState = {
  invoiceRecords: Record<string, InvoiceRecord>;
  milestoneRecords: Record<string, MilestoneRecord>;
  payerSecrets: Record<string, Uint8Array>;
  supplierSecrets: Record<string, Uint8Array>;
  fundedCoins: Record<string, FundedCoin>;
  fundedMilestoneCoins: Record<string, FundedCoin>;
  activeInvoiceId?: string;
  activeMilestoneKey?: string;
  activeAuthority?: "payer" | "supplier";
  activeFundedInvoiceId?: string;
  activeFundedMilestoneKey?: string;
};

export function createInitialInvoicePrivateState(): InvoicePrivateState {
  return {
    invoiceRecords: {},
    milestoneRecords: {},
    payerSecrets: {},
    supplierSecrets: {},
    fundedCoins: {},
    fundedMilestoneCoins: {},
  };
}

function key(invoiceIdHex: string) { return bytesToHex(hexToBytes32(invoiceIdHex, "invoice id")); }
function milestoneKey(invoiceIdHex: string, index: number) {
  if (!Number.isInteger(index) || index < 0 || index > 0xffff) throw new Error("Milestone index must fit Uint16");
  return `${key(invoiceIdHex)}:${index}`;
}

function fromWitness(w: PrivateInvoiceWitness): InvoiceRecord {
  assertInvoiceWitness(w);
  return {
    amountMinor: w.amountMinor,
    taxMinor: w.taxMinor,
    payerPublicKey: hexToBytes32(w.payerPublicKeyHex),
    supplierPublicKey: hexToBytes32(w.supplierPublicKeyHex),
    payerCoinPublicKey: hexToBytes32(w.payerCoinPublicKeyHex),
    supplierCoinPublicKey: hexToBytes32(w.supplierCoinPublicKeyHex),
    dueAt: w.dueAt,
    salt: hexToBytes32(w.saltHex),
  };
}

function milestoneFromWitness(invoiceIdHex: string, index: number, witness: PrivateMilestoneWitness): MilestoneRecord {
  assertMilestoneDraft({ invoiceIdHex, index, witness });
  return { amountMinor: witness.amountMinor, salt: hexToBytes32(witness.saltHex) };
}

export function upsertInvoiceRecord(state: InvoicePrivateState, invoiceIdHex: string, witness: PrivateInvoiceWitness): InvoicePrivateState {
  const id = key(invoiceIdHex), incoming = fromWitness(witness), existing = state.invoiceRecords[id];
  if (existing) {
    const same = existing.amountMinor === incoming.amountMinor && existing.taxMinor === incoming.taxMinor && existing.dueAt === incoming.dueAt &&
      bytesToHex(existing.payerPublicKey) === bytesToHex(incoming.payerPublicKey) && bytesToHex(existing.supplierPublicKey) === bytesToHex(incoming.supplierPublicKey) &&
      bytesToHex(existing.payerCoinPublicKey) === bytesToHex(incoming.payerCoinPublicKey) && bytesToHex(existing.supplierCoinPublicKey) === bytesToHex(incoming.supplierCoinPublicKey) &&
      bytesToHex(existing.salt) === bytesToHex(incoming.salt);
    if (!same) throw new Error("Existing private invoice record cannot be overwritten with different data");
  }
  return { ...state, invoiceRecords: { ...state.invoiceRecords, [id]: existing ?? incoming }, activeInvoiceId: id };
}

export function upsertMilestoneRecord(state: InvoicePrivateState, invoiceIdHex: string, index: number, witness: PrivateMilestoneWitness): InvoicePrivateState {
  const id = milestoneKey(invoiceIdHex, index), incoming = milestoneFromWitness(invoiceIdHex, index, witness), existing = state.milestoneRecords[id];
  if (existing && (existing.amountMinor !== incoming.amountMinor || bytesToHex(existing.salt) !== bytesToHex(incoming.salt))) {
    throw new Error("Existing private milestone record cannot be overwritten with different data");
  }
  return { ...state, milestoneRecords: { ...state.milestoneRecords, [id]: existing ?? incoming }, activeMilestoneKey: id, activeInvoiceId: key(invoiceIdHex) };
}

export function setInvoiceAuthority(state: InvoicePrivateState, invoiceIdHex: string, role: "payer" | "supplier", secretHex: string): InvoicePrivateState {
  assertNonZeroBytes32(secretHex, `${role} secret`);
  const id = key(invoiceIdHex), secret = hexToBytes32(secretHex, `${role} secret`);
  return role === "payer"
    ? { ...state, payerSecrets: { ...state.payerSecrets, [id]: secret }, activeInvoiceId: id, activeAuthority: role }
    : { ...state, supplierSecrets: { ...state.supplierSecrets, [id]: secret }, activeInvoiceId: id, activeAuthority: role };
}

export function setBothInvoiceAuthorities(state: InvoicePrivateState, invoiceIdHex: string, payerSecretHex: string, supplierSecretHex: string): InvoicePrivateState {
  assertNonZeroBytes32(payerSecretHex, "payer secret");
  assertNonZeroBytes32(supplierSecretHex, "supplier secret");
  const id = key(invoiceIdHex);
  return {
    ...state,
    payerSecrets: { ...state.payerSecrets, [id]: hexToBytes32(payerSecretHex, "payer secret") },
    supplierSecrets: { ...state.supplierSecrets, [id]: hexToBytes32(supplierSecretHex, "supplier secret") },
    activeInvoiceId: id,
  };
}

export function clearInvoiceAuthorities(state: InvoicePrivateState, invoiceIdHex: string): InvoicePrivateState {
  const id = key(invoiceIdHex);
  const payerSecrets = { ...state.payerSecrets };
  const supplierSecrets = { ...state.supplierSecrets };
  delete payerSecrets[id];
  delete supplierSecrets[id];
  return {
    ...state,
    payerSecrets,
    supplierSecrets,
    activeAuthority: state.activeInvoiceId === id ? undefined : state.activeAuthority,
  };
}

export function clearConsumedInvoiceCoin(state: InvoicePrivateState, invoiceIdHex: string): InvoicePrivateState {
  const id = key(invoiceIdHex);
  const fundedCoins = { ...state.fundedCoins };
  delete fundedCoins[id];
  return {
    ...state,
    fundedCoins,
    activeFundedInvoiceId: state.activeFundedInvoiceId === id ? undefined : state.activeFundedInvoiceId,
  };
}

export function clearConsumedMilestoneCoin(state: InvoicePrivateState, invoiceIdHex: string, index: number): InvoicePrivateState {
  const id = milestoneKey(invoiceIdHex, index);
  const fundedMilestoneCoins = { ...state.fundedMilestoneCoins };
  delete fundedMilestoneCoins[id];
  return {
    ...state,
    fundedMilestoneCoins,
    activeFundedMilestoneKey: state.activeFundedMilestoneKey === id ? undefined : state.activeFundedMilestoneKey,
  };
}

export function activateInvoice(state: InvoicePrivateState, invoiceIdHex: string): InvoicePrivateState {
  const id = key(invoiceIdHex); if (!state.invoiceRecords[id]) throw new Error("Private invoice witness is unavailable"); return { ...state, activeInvoiceId: id };
}

export function activateMilestone(state: InvoicePrivateState, invoiceIdHex: string, index: number): InvoicePrivateState {
  const id = milestoneKey(invoiceIdHex, index); if (!state.milestoneRecords[id]) throw new Error("Private milestone witness is unavailable");
  return { ...state, activeInvoiceId: key(invoiceIdHex), activeMilestoneKey: id };
}

export function getInvoiceRecord(state: InvoicePrivateState, invoiceIdHex: string): InvoiceRecord {
  const record = state.invoiceRecords[key(invoiceIdHex)]; if (!record) throw new Error("Private invoice witness is unavailable"); return record;
}

export function getMilestoneRecord(state: InvoicePrivateState, invoiceIdHex: string, index: number): MilestoneRecord {
  const record = state.milestoneRecords[milestoneKey(invoiceIdHex, index)]; if (!record) throw new Error("Private milestone witness is unavailable"); return record;
}

function validateCoinCandidates(candidatesInput: bigint[]): bigint[] {
  const candidates = [...new Set(candidatesInput.map(BigInt))];
  if (!candidates.length || candidates.length > 32 || candidates.some((value) => value < 0n || value > ((1n << 64n) - 1n))) throw new Error("Invalid funded-coin candidates");
  return candidates;
}

export function attachFundedCoin(state: InvoicePrivateState, invoiceIdHex: string, coin: { nonceHex: string; colorHex: string; value: bigint; mtIndexCandidates: bigint[] }): InvoicePrivateState {
  const id = key(invoiceIdHex), record = state.invoiceRecords[id]; if (!record) throw new Error("Private invoice witness is unavailable"); if (coin.value !== record.amountMinor) throw new Error("Funded amount does not match invoice");
  return { ...state, fundedCoins: { ...state.fundedCoins, [id]: { nonce: hexToBytes32(coin.nonceHex), color: hexToBytes32(coin.colorHex), value: coin.value, mtIndexCandidates: validateCoinCandidates(coin.mtIndexCandidates) } } };
}

export function attachFundedMilestoneCoin(state: InvoicePrivateState, invoiceIdHex: string, index: number, coin: { nonceHex: string; colorHex: string; value: bigint; mtIndexCandidates: bigint[] }): InvoicePrivateState {
  const id = milestoneKey(invoiceIdHex, index), record = state.milestoneRecords[id]; if (!record) throw new Error("Private milestone witness is unavailable"); if (coin.value !== record.amountMinor) throw new Error("Funded amount does not match milestone");
  return { ...state, fundedMilestoneCoins: { ...state.fundedMilestoneCoins, [id]: { nonce: hexToBytes32(coin.nonceHex), color: hexToBytes32(coin.colorHex), value: coin.value, mtIndexCandidates: validateCoinCandidates(coin.mtIndexCandidates) } } };
}

export function activateFundedCoin(state: InvoicePrivateState, invoiceIdHex: string, mtIndex: bigint): InvoicePrivateState {
  const id = key(invoiceIdHex), funded = state.fundedCoins[id]; if (!funded || !funded.mtIndexCandidates.includes(mtIndex)) throw new Error("Funded coin candidate is unavailable");
  return { ...state, activeFundedInvoiceId: id, fundedCoins: { ...state.fundedCoins, [id]: { ...funded, activeMtIndex: mtIndex } } };
}

export function activateFundedMilestoneCoin(state: InvoicePrivateState, invoiceIdHex: string, index: number, mtIndex: bigint): InvoicePrivateState {
  const id = milestoneKey(invoiceIdHex, index), funded = state.fundedMilestoneCoins[id]; if (!funded || !funded.mtIndexCandidates.includes(mtIndex)) throw new Error("Funded milestone coin candidate is unavailable");
  return { ...state, activeFundedMilestoneKey: id, fundedMilestoneCoins: { ...state.fundedMilestoneCoins, [id]: { ...funded, activeMtIndex: mtIndex } } };
}

export function fundedCoinCandidates(state: InvoicePrivateState, invoiceIdHex: string) { return [...(state.fundedCoins[key(invoiceIdHex)]?.mtIndexCandidates ?? [])]; }
export function fundedMilestoneCoinCandidates(state: InvoicePrivateState, invoiceIdHex: string, index: number) { return [...(state.fundedMilestoneCoins[milestoneKey(invoiceIdHex, index)]?.mtIndexCandidates ?? [])]; }

export function invoiceWitnesses() {
  return {
    getInvoiceRecord(context: { privateState: InvoicePrivateState }) {
      const id = context.privateState.activeInvoiceId; const record = id ? context.privateState.invoiceRecords[id] : undefined;
      if (!record) throw new Error("Private invoice witness is not active"); return [context.privateState, record] as const;
    },
    getMilestoneRecord(context: { privateState: InvoicePrivateState }) {
      const id = context.privateState.activeMilestoneKey; const record = id ? context.privateState.milestoneRecords[id] : undefined;
      if (!record) throw new Error("Private milestone witness is not active"); return [context.privateState, record] as const;
    },
    getPayerSecret(context: { privateState: InvoicePrivateState }) {
      const id = context.privateState.activeInvoiceId; const secret = id ? context.privateState.payerSecrets[id] : undefined;
      if (!secret) throw new Error("Payer authority is not loaded"); return [context.privateState, secret] as const;
    },
    getSupplierSecret(context: { privateState: InvoicePrivateState }) {
      const id = context.privateState.activeInvoiceId; const secret = id ? context.privateState.supplierSecrets[id] : undefined;
      if (!secret) throw new Error("Supplier authority is not loaded"); return [context.privateState, secret] as const;
    },
    getFundedCoin(context: { privateState: InvoicePrivateState }) {
      const id = context.privateState.activeFundedInvoiceId; const funded = id ? context.privateState.fundedCoins[id] : undefined;
      if (!funded || funded.activeMtIndex === undefined) throw new Error("Funded invoice coin is not active");
      return [context.privateState, { nonce: new Uint8Array(funded.nonce), color: new Uint8Array(funded.color), value: funded.value, mt_index: funded.activeMtIndex }] as const;
    },
    getFundedMilestoneCoin(context: { privateState: InvoicePrivateState }) {
      const id = context.privateState.activeFundedMilestoneKey; const funded = id ? context.privateState.fundedMilestoneCoins[id] : undefined;
      if (!funded || funded.activeMtIndex === undefined) throw new Error("Funded milestone coin is not active");
      return [context.privateState, { nonce: new Uint8Array(funded.nonce), color: new Uint8Array(funded.color), value: funded.value, mt_index: funded.activeMtIndex }] as const;
    },
  };
}

export function createInvoicePrivateStateProvider(accountId: string, password: string): PrivateStateProvider<typeof INVOICE_PRIVATE_STATE_ID, InvoicePrivateState> {
  if (!accountId.trim()) throw new Error("Wallet account identifier is required"); if (password.length < 16 || password.length > 256) throw new Error("Private-state password must contain 16–256 characters");
  return levelPrivateStateProvider<typeof INVOICE_PRIVATE_STATE_ID, InvoicePrivateState>({ accountId, privateStateStoreName: "blackout-invoice-private-states-v2", signingKeyStoreName: "blackout-invoice-signing-keys-v2", privateStoragePasswordProvider: () => password, cryptoBackend: "webcrypto" });
}
