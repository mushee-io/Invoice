import type { Configuration, ConnectedAPI, InitialAPI } from "@midnight-ntwrk/dapp-connector-api";
import { setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import { getInvoicePublicConfig } from "./network";

export type AvailableWallet = { id: string; name: string; rdns: string; apiVersion: string; api: InitialAPI };
export type ConnectedWallet = {
  id: string; name: string; api: ConnectedAPI; configuration: Configuration; networkId: string;
  addresses: { shieldedAddress: string; shieldedCoinPublicKey: string; shieldedEncryptionPublicKey: string };
};

type MidnightWindow = Window & { midnight?: Record<string, InitialAPI> };
let activeConnection: ConnectedWallet | null = null;

function injectedWallets(): Record<string, InitialAPI> {
  if (typeof window === "undefined") return {};
  return (window as MidnightWindow).midnight ?? {};
}

export function listMidnightWallets(): AvailableWallet[] {
  return Object.entries(injectedWallets()).filter(([, api]) => api && typeof api.connect === "function").map(([id, api]) => ({
    id, name: api.name || "Midnight wallet", rdns: api.rdns || "unknown", apiVersion: api.apiVersion || "unknown", api,
  }));
}

function assertSecureUri(value: string, label: string, allowed: readonly string[]) {
  const parsed = new URL(value);
  if (parsed.username || parsed.password) throw new Error(`${label} must not contain credentials`);
  const local = ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname);
  if (!local && !allowed.includes(parsed.protocol)) throw new Error(`${label} must use secure transport`);
}

export async function connectMidnightWallet(walletId?: string): Promise<ConnectedWallet> {
  const wallets = listMidnightWallets();
  if (!wallets.length) throw new Error("No Midnight DApp Connector wallet detected. Install Lace with Midnight support.");
  const selected = walletId ? wallets.find(w => w.id === walletId) : wallets.find(w => /lace/i.test(`${w.name} ${w.rdns}`)) ?? wallets[0];
  if (!selected) throw new Error("Selected Midnight wallet is unavailable");
  const requested = getInvoicePublicConfig().network;
  const api = await selected.api.connect(requested);
  const status = await api.getConnectionStatus();
  if (status.status !== "connected") throw new Error("Wallet connection was not authorized");
  if (status.networkId !== requested) throw new Error(`Midnight network mismatch: required ${requested}, wallet is on ${status.networkId}`);
  const configuration = await api.getConfiguration();
  assertSecureUri(configuration.indexerUri, "Indexer URI", ["https:"]);
  assertSecureUri(configuration.indexerWsUri, "Indexer WebSocket URI", ["wss:"]);
  assertSecureUri(configuration.substrateNodeUri, "Substrate node URI", ["wss:", "https:"]);
  const addresses = await api.getShieldedAddresses();
  if (!addresses.shieldedAddress || !addresses.shieldedCoinPublicKey || !addresses.shieldedEncryptionPublicKey) throw new Error("Wallet returned incomplete shielded addresses");
  await api.hintUsage(["getShieldedAddresses", "getConfiguration", "getConnectionStatus", "balanceUnsealedTransaction", "submitTransaction", "getProvingProvider"]);
  setNetworkId(status.networkId);
  activeConnection = { id: selected.id, name: selected.name, api, configuration, networkId: status.networkId, addresses };
  return activeConnection;
}

export async function assertWalletStillConnected(wallet: ConnectedWallet): Promise<void> {
  const status = await wallet.api.getConnectionStatus();
  if (status.status !== "connected" || status.networkId !== wallet.networkId) { activeConnection = null; throw new Error("Lace session or network changed. Reconnect."); }
  const addresses = await wallet.api.getShieldedAddresses();
  if (addresses.shieldedAddress !== wallet.addresses.shieldedAddress || addresses.shieldedCoinPublicKey !== wallet.addresses.shieldedCoinPublicKey) {
    activeConnection = null; throw new Error("Lace account changed during the session. Reconnect.");
  }
}
