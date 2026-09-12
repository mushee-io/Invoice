import { CostModel } from "@midnight-ntwrk/ledger-v8";
import { dappConnectorProofProvider } from "@midnight-ntwrk/midnight-js-dapp-connector-proof-provider";
import { FetchZkConfigProvider } from "@midnight-ntwrk/midnight-js-fetch-zk-config-provider";
import { indexerPublicDataProvider } from "@midnight-ntwrk/midnight-js-indexer-public-data-provider";
import * as ledger from "@midnight-ntwrk/midnight-js-protocol/ledger";
import type { MidnightProvider, MidnightProviders, WalletProvider } from "@midnight-ntwrk/midnight-js-types";
import { transactionBytesToHex, transactionHexToBytes } from "./bytes";
import { INVOICE_PRIVATE_STATE_ID, createInvoicePrivateStateProvider, type InvoicePrivateState } from "./private-state";
import { assertWalletStillConnected, type ConnectedWallet } from "./wallet";

export type InvoiceCircuitId =
  | "createInvoice" | "acceptInvoice" | "cancelInvoice" | "fundInvoice" | "payInvoice" | "approveInvoiceRefund" | "refundInvoice"
  | "proveInvoiceExists" | "proveInvoiceAccepted" | "proveInvoicePaid" | "proveAmountAtLeast"
  | "registerMilestone" | "fundMilestone" | "releaseMilestone" | "approveMilestoneRefund" | "refundMilestone"
  | "createAmountDisclosure" | "createTaxDisclosure" | "createDueDateDisclosure" | "revokeDisclosure"
  | "createReceipt";

export type InvoiceProviders = MidnightProviders<InvoiceCircuitId, typeof INVOICE_PRIVATE_STATE_ID, InvoicePrivateState>;

export async function buildInvoiceProviders(wallet: ConnectedWallet, password: string): Promise<InvoiceProviders> {
  await assertWalletStillConnected(wallet);
  const origin = window.location.origin;
  if (!origin.startsWith("https://") && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) throw new Error("Blackout Invoice requires HTTPS outside localhost");
  const zkConfigProvider = new FetchZkConfigProvider<InvoiceCircuitId>(`${origin}/invoice`, fetch.bind(window));
  if (typeof wallet.api.getProvingProvider !== "function") throw new Error("Connected wallet does not support delegated proving");
  const proofProvider = await dappConnectorProofProvider(wallet.api, zkConfigProvider, CostModel.initialCostModel());
  const publicDataProvider = indexerPublicDataProvider(wallet.configuration.indexerUri, wallet.configuration.indexerWsUri);
  const privateStateProvider = createInvoicePrivateStateProvider(wallet.addresses.shieldedAddress, password);
  const walletProvider: WalletProvider = {
    getCoinPublicKey: () => wallet.addresses.shieldedCoinPublicKey as ledger.CoinPublicKey,
    getEncryptionPublicKey: () => wallet.addresses.shieldedEncryptionPublicKey as ledger.EncPublicKey,
    async balanceTx(tx: ledger.Transaction<ledger.SignatureEnabled, ledger.Proof, ledger.PreBinding>): Promise<ledger.FinalizedTransaction> {
      await assertWalletStillConnected(wallet);
      const balanced = await wallet.api.balanceUnsealedTransaction(transactionBytesToHex(tx.serialize()), { payFees: true });
      if (!balanced.tx?.trim()) throw new Error("Wallet returned no balanced transaction");
      return ledger.Transaction.deserialize("signature", "proof", "binding", transactionHexToBytes(balanced.tx)) as ledger.FinalizedTransaction;
    },
  };
  const midnightProvider: MidnightProvider = {
    async submitTx(tx: ledger.FinalizedTransaction): Promise<ledger.TransactionId> {
      await assertWalletStillConnected(wallet);
      const [transactionId] = tx.identifiers();
      if (!transactionId) throw new Error("Midnight transaction has no identifier");
      await wallet.api.submitTransaction(transactionBytesToHex(tx.serialize()));
      return transactionId;
    },
  };
  return { privateStateProvider, publicDataProvider, zkConfigProvider, proofProvider, walletProvider, midnightProvider };
}
