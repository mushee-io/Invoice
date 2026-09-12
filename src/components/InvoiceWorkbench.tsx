"use client";

import { useMemo, useState } from "react";
import type { DisclosureArtifact, DisclosureField, ReceiptArtifact } from "@/lib/invoice/types";
import { bytesToHex, randomBytes32 } from "@/lib/midnight/bytes";
import { connectMidnightWallet, type ConnectedWallet } from "@/lib/midnight/wallet";
import {
  acceptInvoiceOnChain,
  cancelInvoiceOnChain,
  createAuthority,
  createInvoiceOnChain,
  createReceiptOnChain,
  createSelectiveDisclosureOnChain,
  fundInvoiceOnChain,
  fundMilestoneOnChain,
  getInvoiceStatus,
  getMilestoneStatus,
  initializeInvoiceRuntime,
  payInvoiceOnChain,
  proveAmountAtLeastOnChain,
  proveInvoiceAcceptedOnChain,
  proveInvoiceExistsOnChain,
  proveInvoicePaidOnChain,
  refundInvoiceOnChain,
  refundMilestoneOnChain,
  registerMilestoneOnChain,
  releaseMilestoneOnChain,
  revokeDisclosureOnChain,
  verifyDisclosureArtifactOnChain,
  verifyReceiptOnChain,
} from "@/lib/midnight/runtime";

type Log = { at: string; message: string };
const now = () => new Date().toLocaleTimeString();

export default function InvoiceWorkbench() {
  const [wallet, setWallet] = useState<ConnectedWallet | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [logs, setLogs] = useState<Log[]>([]);
  const [contract, setContract] = useState("");
  const [password, setPassword] = useState("");
  const [invoiceId, setInvoiceId] = useState("");
  const [token, setToken] = useState("");
  const [amount, setAmount] = useState("100000");
  const [tax, setTax] = useState("0");
  const [dueAt, setDueAt] = useState(String(Math.floor(Date.now() / 1000) + 2592000));
  const [payerSecret, setPayerSecret] = useState("");
  const [payerPublic, setPayerPublic] = useState("");
  const [supplierSecret, setSupplierSecret] = useState("");
  const [supplierPublic, setSupplierPublic] = useState("");
  const [payerCoin, setPayerCoin] = useState("");
  const [supplierCoin, setSupplierCoin] = useState("");
  const [salt, setSalt] = useState("");
  const [status, setStatus] = useState("NOT CREATED");

  const [proofThreshold, setProofThreshold] = useState("50000");
  const [proofId, setProofId] = useState("");

  const [milestoneIndex, setMilestoneIndex] = useState("0");
  const [milestoneAmount, setMilestoneAmount] = useState("25000");
  const [milestoneSalt, setMilestoneSalt] = useState("");
  const [milestoneStatus, setMilestoneStatus] = useState("NOT REGISTERED");

  const [verifierId, setVerifierId] = useState("");
  const [disclosureField, setDisclosureField] = useState<DisclosureField>("AMOUNT");
  const [disclosureExpiry, setDisclosureExpiry] = useState(String(Math.floor(Date.now() / 1000) + 86400));
  const [disclosure, setDisclosure] = useState<DisclosureArtifact | null>(null);
  const [receipt, setReceipt] = useState<ReceiptArtifact | null>(null);

  const draft = useMemo(() => ({
    invoiceIdHex: invoiceId,
    tokenColorHex: token,
    witness: {
      amountMinor: BigInt(amount || "0"),
      taxMinor: BigInt(tax || "0"),
      payerPublicKeyHex: payerPublic,
      supplierPublicKeyHex: supplierPublic,
      payerCoinPublicKeyHex: payerCoin,
      supplierCoinPublicKeyHex: supplierCoin,
      dueAt: BigInt(dueAt || "0"),
      saltHex: salt,
    },
  }), [invoiceId, token, amount, tax, payerPublic, supplierPublic, payerCoin, supplierCoin, dueAt, salt]);

  const milestoneDraft = useMemo(() => ({
    invoiceIdHex: invoiceId,
    index: Number(milestoneIndex || "0"),
    witness: { amountMinor: BigInt(milestoneAmount || "0"), saltHex: milestoneSalt },
  }), [invoiceId, milestoneIndex, milestoneAmount, milestoneSalt]);

  const log = (message: string) => setLogs((value) => [{ at: now(), message }, ...value].slice(0, 40));
  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    try { await fn(); }
    catch (error) { log(`FAIL CLOSED — ${error instanceof Error ? error.message : String(error)}`); }
    finally { setBusy(false); }
  };

  return <main className="shell">
    <header>
      <div><small>BLACKOUT / MIDNIGHT</small><h1>INVOICE</h1></div>
      <code>PROVE COMMERCE. REVEAL NOTHING ELSE.</code>
    </header>

    <section className="hero">
      <p>MILESTONES 1–10 / LIVE WORKBENCH</p>
      <h2>CONFIDENTIAL<br />COMMERCIAL<br />SETTLEMENT.</h2>
      <span>Commit → escrow → prove → disclose selectively → issue a verifiable private receipt.</span>
    </section>

    <div className="grid">
      <section className="panel">
        <h3>01 / NETWORK</h3>
        <button disabled={busy} onClick={() => act(async () => {
          const connected = await connectMidnightWallet();
          setWallet(connected);
          const coinKey = connected.addresses.shieldedCoinPublicKey.replace(/^0x/i, "");
          setSupplierCoin((value) => value || coinKey);
          setPayerCoin((value) => value || coinKey);
          log(`Lace connected / ${connected.networkId}`);
        })}>{wallet ? `CONNECTED / ${wallet.name}` : "CONNECT LACE"}</button>
        <input type="password" placeholder="Private-state password (16+ chars)" value={password} onChange={(event) => setPassword(event.target.value)} />
        <input placeholder="Existing protocol v2 contract address" value={contract} onChange={(event) => setContract(event.target.value)} />
        <div className="row">
          <button disabled={!wallet || busy} onClick={() => act(async () => {
            if (!wallet) throw new Error("Connect Lace first");
            const result = await initializeInvoiceRuntime({ wallet, privateStatePassword: password, mode: "deploy" });
            setContract(result.contractAddress); setReady(true);
            log(`REAL protocol v2 deployed / ${result.deploymentTransactionId ?? "tx unavailable"}`);
          })}>DEPLOY V2</button>
          <button disabled={!wallet || busy} onClick={() => act(async () => {
            if (!wallet) throw new Error("Connect Lace first");
            await initializeInvoiceRuntime({ wallet, privateStatePassword: password, mode: "join", contractAddress: contract });
            setReady(true); log("Joined verified protocol v2 contract");
          })}>JOIN</button>
        </div>
      </section>

      <section className="panel">
        <h3>02 / AUTHORITIES</h3>
        <div className="row">
          <button disabled={!ready || busy} onClick={() => act(async () => {
            const authority = await createAuthority(); setSupplierSecret(authority.secretHex); setSupplierPublic(authority.publicKeyHex); log("Supplier authority generated locally");
          })}>NEW SUPPLIER KEY</button>
          <button disabled={!ready || busy} onClick={() => act(async () => {
            const authority = await createAuthority(); setPayerSecret(authority.secretHex); setPayerPublic(authority.publicKeyHex); log("Payer authority generated locally");
          })}>NEW PAYER KEY</button>
        </div>
        <label>Supplier public key<input value={supplierPublic} onChange={(event) => setSupplierPublic(event.target.value)} /></label>
        <label>Payer public key<input value={payerPublic} onChange={(event) => setPayerPublic(event.target.value)} /></label>
      </section>

      <section className="panel wide">
        <h3>03 / PRIVATE INVOICE</h3>
        <div className="fields">
          <label>Invoice ID<input value={invoiceId} onChange={(event) => setInvoiceId(event.target.value)} /></label>
          <button onClick={() => setInvoiceId(bytesToHex(randomBytes32()))}>RANDOM ID</button>
          <label>Token colour<input value={token} onChange={(event) => setToken(event.target.value)} /></label>
          <label>Amount minor<input value={amount} onChange={(event) => setAmount(event.target.value)} /></label>
          <label>Tax minor<input value={tax} onChange={(event) => setTax(event.target.value)} /></label>
          <label>Due unix<input value={dueAt} onChange={(event) => setDueAt(event.target.value)} /></label>
          <label>Payer shielded refund key<input value={payerCoin} onChange={(event) => setPayerCoin(event.target.value.replace(/^0x/i, ""))} /></label>
          <label>Supplier shielded payout key<input value={supplierCoin} onChange={(event) => setSupplierCoin(event.target.value.replace(/^0x/i, ""))} /></label>
          <label>Salt<input value={salt} onChange={(event) => setSalt(event.target.value)} /></label>
          <button onClick={() => setSalt(bytesToHex(randomBytes32()))}>RANDOM SALT</button>
        </div>
        <p className="privacy">PUBLIC → commitment / token / state / proof records / nullifiers &nbsp;&nbsp; PRIVATE → amount / tax / parties / payout keys / due date / milestone amounts / openings</p>
      </section>

      <section className="panel wide">
        <h3>04 / WHOLE-INVOICE ESCROW <b>{status}</b></h3>
        <div className="flow">
          <button disabled={!ready || busy} onClick={() => act(async () => {
            const result = await createInvoiceOnChain({ ...draft, supplierSecretHex: supplierSecret }); setStatus("CREATED"); log(`Invoice committed / ${result.transactionId}`);
          })}>CREATE</button>
          <i>→</i>
          <button disabled={!ready || busy} onClick={() => act(async () => {
            const result = await acceptInvoiceOnChain({ ...draft, payerSecretHex: payerSecret }); setStatus("ACCEPTED"); log(`Accepted / ${result.transactionId}`);
          })}>ACCEPT</button>
          <i>→</i>
          <button disabled={!ready || busy} onClick={() => act(async () => {
            const result = await fundInvoiceOnChain({ invoiceIdHex: invoiceId, payerSecretHex: payerSecret }); setStatus("FUNDED"); log(`FUNDS SECURED / ${result.transactionId}`);
          })}>FUND ESCROW</button>
          <i>→</i>
          <button disabled={!ready || busy} onClick={() => act(async () => {
            const result = await payInvoiceOnChain({ invoiceIdHex: invoiceId, payerSecretHex: payerSecret }); setStatus("PAID"); log(`REAL settlement confirmed / ${result.transactionId}`);
          })}>RELEASE</button>
          <button disabled={!ready || busy} onClick={() => act(async () => {
            const result = await cancelInvoiceOnChain({ invoiceIdHex: invoiceId, supplierSecretHex: supplierSecret }); setStatus("CANCELLED"); log(`Unfunded invoice cancelled / ${result.transactionId}`);
          })}>CANCEL UNFUNDED</button>
          <button disabled={!ready || busy} onClick={() => act(async () => {
            const result = await refundInvoiceOnChain({ invoiceIdHex: invoiceId, payerSecretHex: payerSecret, supplierSecretHex: supplierSecret }); setStatus("REFUNDED"); log(`Mutual escrow refund / ${result.transactionId}`);
          })}>MUTUAL REFUND</button>
          <button disabled={!ready || busy || !invoiceId} onClick={() => act(async () => {
            const current = await getInvoiceStatus(invoiceId); setStatus(current); log(`Indexer invoice state / ${current}`);
          })}>REFRESH LEDGER</button>
        </div>
      </section>

      <section className="panel wide">
        <h3>06 / PROOF RECEIVABLES <b>{proofId ? proofId.slice(0, 12) : "NO PROOF"}</b></h3>
        <div className="flow">
          <button disabled={!ready || busy} onClick={() => act(async () => { const result = await proveInvoiceExistsOnChain(invoiceId); setProofId(result.proofIdHex); log(`ZK EXISTS proof / ${result.proofIdHex}`); })}>PROVE EXISTS</button>
          <button disabled={!ready || busy} onClick={() => act(async () => { const result = await proveInvoiceAcceptedOnChain(invoiceId); setProofId(result.proofIdHex); log(`ZK ACCEPTED proof / ${result.proofIdHex}`); })}>PROVE ACCEPTED</button>
          <button disabled={!ready || busy} onClick={() => act(async () => { const result = await proveInvoicePaidOnChain(invoiceId); setProofId(result.proofIdHex); log(`ZK PAID proof / ${result.proofIdHex}`); })}>PROVE PAID</button>
          <label>Threshold minor<input value={proofThreshold} onChange={(event) => setProofThreshold(event.target.value)} /></label>
          <button disabled={!ready || busy} onClick={() => act(async () => { const result = await proveAmountAtLeastOnChain({ invoiceIdHex: invoiceId, thresholdMinor: BigInt(proofThreshold || "0") }); setProofId(result.proofIdHex); log(`ZK amount ≥ ${proofThreshold} / ${result.proofIdHex}`); })}>PROVE AMOUNT ≥</button>
        </div>
        <p className="privacy">The proof record exposes the claim and selected threshold—not the exact private amount, tax, parties, payout keys or commercial terms.</p>
      </section>

      <section className="panel wide">
        <h3>07–08 / PRIVATE MILESTONE ESCROW <b>{milestoneStatus}</b></h3>
        <div className="fields">
          <label>Milestone index<input value={milestoneIndex} onChange={(event) => setMilestoneIndex(event.target.value)} /></label>
          <label>Private tranche amount<input value={milestoneAmount} onChange={(event) => setMilestoneAmount(event.target.value)} /></label>
          <label>Milestone salt<input value={milestoneSalt} onChange={(event) => setMilestoneSalt(event.target.value)} /></label>
          <button onClick={() => setMilestoneSalt(bytesToHex(randomBytes32()))}>RANDOM MILESTONE SALT</button>
        </div>
        <div className="flow">
          <button disabled={!ready || busy} onClick={() => act(async () => { const result = await registerMilestoneOnChain({ ...milestoneDraft, supplierSecretHex: supplierSecret }); setMilestoneStatus("REGISTERED"); log(`Milestone registered / ${result.milestoneIdHex}`); })}>REGISTER</button>
          <i>→</i>
          <button disabled={!ready || busy} onClick={() => act(async () => { const result = await fundMilestoneOnChain({ invoiceIdHex: invoiceId, index: Number(milestoneIndex), payerSecretHex: payerSecret }); setMilestoneStatus("FUNDED"); log(`Milestone funds secured / ${result.transactionId}`); })}>FUND TRANCHE</button>
          <i>→</i>
          <button disabled={!ready || busy} onClick={() => act(async () => { const result = await releaseMilestoneOnChain({ invoiceIdHex: invoiceId, index: Number(milestoneIndex), payerSecretHex: payerSecret }); setMilestoneStatus("RELEASED"); log(`Milestone released / ${result.transactionId}`); })}>RELEASE</button>
          <button disabled={!ready || busy} onClick={() => act(async () => { const result = await refundMilestoneOnChain({ invoiceIdHex: invoiceId, index: Number(milestoneIndex), payerSecretHex: payerSecret, supplierSecretHex: supplierSecret }); setMilestoneStatus("REFUNDED"); log(`Milestone mutually refunded / ${result.transactionId}`); })}>MUTUAL REFUND</button>
          <button disabled={!ready || busy} onClick={() => act(async () => { const current = await getMilestoneStatus(invoiceId, Number(milestoneIndex)); setMilestoneStatus(current); log(`Indexer milestone state / ${current}`); })}>REFRESH</button>
        </div>
        <p className="privacy">Each tranche is a separate contract-held shielded coin. No public running escrow balance is published.</p>
      </section>

      <section className="panel wide">
        <h3>09 / SELECTIVE DISCLOSURE <b>{disclosure?.disclosureIdHex.slice(0, 12) ?? "NONE"}</b></h3>
        <div className="fields">
          <label>Verifier ID<input value={verifierId} onChange={(event) => setVerifierId(event.target.value)} /></label>
          <button onClick={() => setVerifierId(bytesToHex(randomBytes32()))}>RANDOM VERIFIER</button>
          <label>Field<select value={disclosureField} onChange={(event) => setDisclosureField(event.target.value as DisclosureField)}><option value="AMOUNT">AMOUNT</option><option value="TAX">TAX</option><option value="DUE_DATE">DUE DATE</option></select></label>
          <label>Expires unix<input value={disclosureExpiry} onChange={(event) => setDisclosureExpiry(event.target.value)} /></label>
        </div>
        <div className="flow">
          <button disabled={!ready || busy} onClick={() => act(async () => {
            const artifact = await createSelectiveDisclosureOnChain({ invoiceIdHex: invoiceId, supplierSecretHex: supplierSecret, field: disclosureField, verifierIdHex: verifierId, expiresAt: BigInt(disclosureExpiry || "0") });
            setDisclosure(artifact); log(`Selective ${artifact.field} disclosure created / ${artifact.disclosureIdHex}`);
          })}>CREATE DISCLOSURE</button>
          <button disabled={!ready || busy || !disclosure} onClick={() => act(async () => {
            if (!disclosure) throw new Error("Create a disclosure first"); const result = await verifyDisclosureArtifactOnChain(disclosure); log(`Disclosure verify / ${result.valid ? "VALID" : "INVALID"}`);
          })}>VERIFY ARTIFACT</button>
          <button disabled={!ready || busy || !disclosure} onClick={() => act(async () => {
            if (!disclosure) throw new Error("Create a disclosure first"); const result = await revokeDisclosureOnChain({ invoiceIdHex: invoiceId, disclosureIdHex: disclosure.disclosureIdHex, supplierSecretHex: supplierSecret }); log(`Disclosure revoked / ${result.transactionId}`);
          })}>REVOKE</button>
        </div>
        {disclosure && <p className="privacy">PRIVATE HANDOFF → {disclosure.field}: {disclosure.valueMinor.toString()} / opening: {disclosure.openingHex.slice(0, 12)}… &nbsp; PUBLIC LEDGER → only committed field + verifier + expiry.</p>}
      </section>

      <section className="panel wide">
        <h3>10 / PRIVATE RECEIPT <b>{receipt?.receiptIdHex.slice(0, 12) ?? "NONE"}</b></h3>
        <div className="flow">
          <button disabled={!ready || busy || !verifierId} onClick={() => act(async () => {
            const artifact = await createReceiptOnChain({ invoiceIdHex: invoiceId, supplierSecretHex: supplierSecret, verifierIdHex: verifierId }); setReceipt(artifact); log(`Receipt committed / ${artifact.receiptIdHex}`);
          })}>CREATE RECEIPT</button>
          <button disabled={!ready || busy || !receipt} onClick={() => act(async () => {
            if (!receipt) throw new Error("Create a receipt first"); const result = await verifyReceiptOnChain(receipt); log(`Receipt verify / ${result.valid ? "VALID + PAID" : "INVALID"}`);
          })}>VERIFY RECEIPT</button>
        </div>
        {receipt && <p className="privacy">Receipt proves the paid invoice commitment and payment nullifier without publishing the exact invoice amount or parties.</p>}
      </section>

      <section className="panel wide terminal">
        <h3>11 / PROTOCOL LOG</h3>
        {logs.length ? logs.map((entry, index) => <div className="log" key={index}><time>{entry.at}</time><span>{entry.message}</span></div>) : <p>No actions yet.</p>}
      </section>
    </div>
  </main>;
}
