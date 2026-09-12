import { levelPrivateStateProvider } from "@midnight-ntwrk/midnight-js-level-private-state-provider";
import type { PrivateStateProvider } from "@midnight-ntwrk/midnight-js-types";
import { assertInvoiceWitness, type PrivateInvoiceWitness } from "../invoice/types";
import { bytesToHex, hexToBytes32 } from "./bytes";

export const INVOICE_PRIVATE_STATE_ID = "blackoutInvoicePrivateState" as const;

type InvoiceRecord = {
  amountMinor: bigint; taxMinor: bigint; payerPublicKey: Uint8Array; supplierPublicKey: Uint8Array;
  supplierCoinPublicKey: Uint8Array; dueAt: bigint; salt: Uint8Array;
};
type FundedCoin = { nonce: Uint8Array; color: Uint8Array; value: bigint; mtIndexCandidates: bigint[]; activeMtIndex?: bigint };
export type InvoicePrivateState = {
  invoiceRecords: Record<string, InvoiceRecord>;
  payerSecrets: Record<string, Uint8Array>;
  supplierSecrets: Record<string, Uint8Array>;
  fundedCoins: Record<string, FundedCoin>;
  activeInvoiceId?: string;
  activeAuthority?: "payer" | "supplier";
  activeFundedInvoiceId?: string;
};

export function createInitialInvoicePrivateState(): InvoicePrivateState {
  return { invoiceRecords: {}, payerSecrets: {}, supplierSecrets: {}, fundedCoins: {} };
}
function key(invoiceIdHex: string) { return bytesToHex(hexToBytes32(invoiceIdHex, "invoice id")); }
function fromWitness(w: PrivateInvoiceWitness): InvoiceRecord {
  assertInvoiceWitness(w);
  return { amountMinor: w.amountMinor, taxMinor: w.taxMinor, payerPublicKey: hexToBytes32(w.payerPublicKeyHex), supplierPublicKey: hexToBytes32(w.supplierPublicKeyHex), supplierCoinPublicKey: hexToBytes32(w.supplierCoinPublicKeyHex), dueAt: w.dueAt, salt: hexToBytes32(w.saltHex) };
}
export function upsertInvoiceRecord(state: InvoicePrivateState, invoiceIdHex: string, witness: PrivateInvoiceWitness): InvoicePrivateState {
  const id = key(invoiceIdHex), incoming = fromWitness(witness), existing = state.invoiceRecords[id];
  if (existing) {
    const same = existing.amountMinor === incoming.amountMinor && existing.taxMinor === incoming.taxMinor && existing.dueAt === incoming.dueAt &&
      bytesToHex(existing.payerPublicKey) === bytesToHex(incoming.payerPublicKey) && bytesToHex(existing.supplierPublicKey) === bytesToHex(incoming.supplierPublicKey) &&
      bytesToHex(existing.supplierCoinPublicKey) === bytesToHex(incoming.supplierCoinPublicKey) && bytesToHex(existing.salt) === bytesToHex(incoming.salt);
    if (!same) throw new Error("Existing private invoice record cannot be overwritten with different data");
  }
  return { ...state, invoiceRecords: { ...state.invoiceRecords, [id]: existing ?? incoming }, activeInvoiceId: id };
}
export function setInvoiceAuthority(state: InvoicePrivateState, invoiceIdHex: string, role: "payer" | "supplier", secretHex: string): InvoicePrivateState {
  const id = key(invoiceIdHex), secret = hexToBytes32(secretHex, `${role} secret`);
  return role === "payer" ? { ...state, payerSecrets: { ...state.payerSecrets, [id]: secret }, activeInvoiceId: id, activeAuthority: role } : { ...state, supplierSecrets: { ...state.supplierSecrets, [id]: secret }, activeInvoiceId: id, activeAuthority: role };
}
export function activateInvoice(state: InvoicePrivateState, invoiceIdHex: string): InvoicePrivateState {
  const id = key(invoiceIdHex); if (!state.invoiceRecords[id]) throw new Error("Private invoice witness is unavailable"); return { ...state, activeInvoiceId: id };
}
export function getInvoiceRecord(state: InvoicePrivateState, invoiceIdHex: string): InvoiceRecord {
  const record = state.invoiceRecords[key(invoiceIdHex)]; if (!record) throw new Error("Private invoice witness is unavailable"); return record;
}
export function attachFundedCoin(state: InvoicePrivateState, invoiceIdHex: string, coin: { nonceHex: string; colorHex: string; value: bigint; mtIndexCandidates: bigint[] }): InvoicePrivateState {
  const id = key(invoiceIdHex), record = state.invoiceRecords[id]; if (!record) throw new Error("Private invoice witness is unavailable"); if (coin.value !== record.amountMinor) throw new Error("Funded amount does not match invoice");
  const candidates = [...new Set(coin.mtIndexCandidates.map(BigInt))]; if (!candidates.length || candidates.length > 32) throw new Error("Invalid funded-coin candidates");
  return { ...state, fundedCoins: { ...state.fundedCoins, [id]: { nonce: hexToBytes32(coin.nonceHex), color: hexToBytes32(coin.colorHex), value: coin.value, mtIndexCandidates: candidates } } };
}
export function activateFundedCoin(state: InvoicePrivateState, invoiceIdHex: string, mtIndex: bigint): InvoicePrivateState {
  const id = key(invoiceIdHex), funded = state.fundedCoins[id]; if (!funded || !funded.mtIndexCandidates.includes(mtIndex)) throw new Error("Funded coin candidate is unavailable");
  return { ...state, activeFundedInvoiceId: id, fundedCoins: { ...state.fundedCoins, [id]: { ...funded, activeMtIndex: mtIndex } } };
}
export function fundedCoinCandidates(state: InvoicePrivateState, invoiceIdHex: string) { return [...(state.fundedCoins[key(invoiceIdHex)]?.mtIndexCandidates ?? [])]; }
export function invoiceWitnesses() {
  return {
    getInvoiceRecord(context: { privateState: InvoicePrivateState }) { const id = context.privateState.activeInvoiceId; const record = id ? context.privateState.invoiceRecords[id] : undefined; if (!record) throw new Error("Private invoice witness is not active"); return [context.privateState, record] as const; },
    getPayerSecret(context: { privateState: InvoicePrivateState }) { const id = context.privateState.activeInvoiceId; const secret = id ? context.privateState.payerSecrets[id] : undefined; if (!secret || context.privateState.activeAuthority !== "payer") throw new Error("Payer authority is not active"); return [context.privateState, secret] as const; },
    getSupplierSecret(context: { privateState: InvoicePrivateState }) { const id = context.privateState.activeInvoiceId; const secret = id ? context.privateState.supplierSecrets[id] : undefined; if (!secret || context.privateState.activeAuthority !== "supplier") throw new Error("Supplier authority is not active"); return [context.privateState, secret] as const; },
    getFundedCoin(context: { privateState: InvoicePrivateState }) { const id = context.privateState.activeFundedInvoiceId; const funded = id ? context.privateState.fundedCoins[id] : undefined; if (!funded || funded.activeMtIndex === undefined) throw new Error("Funded invoice coin is not active"); return [context.privateState, { nonce: new Uint8Array(funded.nonce), color: new Uint8Array(funded.color), value: funded.value, mt_index: funded.activeMtIndex }] as const; },
  };
}
export function createInvoicePrivateStateProvider(accountId: string, password: string): PrivateStateProvider<typeof INVOICE_PRIVATE_STATE_ID, InvoicePrivateState> {
  if (!accountId.trim()) throw new Error("Wallet account identifier is required"); if (password.length < 16 || password.length > 256) throw new Error("Private-state password must contain 16–256 characters");
  return levelPrivateStateProvider<typeof INVOICE_PRIVATE_STATE_ID, InvoicePrivateState>({ accountId, privateStateStoreName: "blackout-invoice-private-states", signingKeyStoreName: "blackout-invoice-signing-keys", privateStoragePasswordProvider: () => password, cryptoBackend: "webcrypto" });
}
