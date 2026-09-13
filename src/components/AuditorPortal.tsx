"use client";

import { useState } from "react";
import { connectMidnightWallet, type ConnectedWallet } from "@/lib/midnight/wallet";
import { getReceivableProof, initializeInvoiceRuntime } from "@/lib/midnight/runtime";
import { createBusinessEvidenceBundle, verifyBusinessEvidenceBundle } from "@/lib/institutional/business-evidence";

export default function AuditorPortal() {
  const [wallet, setWallet] = useState<ConnectedWallet | null>(null);
  const [contract, setContract] = useState("");
  const [password, setPassword] = useState("");
  const [ready, setReady] = useState(false);
  const [bundleText, setBundleText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Awaited<ReturnType<typeof verifyBusinessEvidenceBundle>> | null>(null);

  async function connect() {
    setBusy(true); setError("");
    try { setWallet(await connectMidnightWallet()); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  }

  async function join() {
    if (!wallet) throw new Error("Connect a compatible Midnight wallet first");
    setBusy(true); setError(""); setResult(null);
    try {
      await initializeInvoiceRuntime({ wallet, privateStatePassword: password, mode: "join", contractAddress: contract });
      setReady(true);
    } catch (cause) {
      setReady(false); setError(cause instanceof Error ? cause.message : String(cause));
    } finally { setBusy(false); }
  }

  async function verifyBundle() {
    if (!ready) throw new Error("Join the deployed invoice contract first");
    setBusy(true); setError(""); setResult(null);
    try {
      const raw = JSON.parse(bundleText) as Record<string, unknown>;
      const paidProofIds = Array.isArray(raw.paidProofIds) ? raw.paidProofIds.map(String) : [];
      const amountThresholdProofIds = Array.isArray(raw.amountThresholdProofIds) ? raw.amountThresholdProofIds.map(String) : [];
      const bundle = createBusinessEvidenceBundle({
        verifierIdHex: String(raw.verifierIdHex ?? ""),
        paidProofIds,
        amountThresholdProofIds,
        createdAt: typeof raw.createdAt === "number" ? raw.createdAt : Date.now(),
      });
      setResult(await verifyBusinessEvidenceBundle(bundle, getReceivableProof));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally { setBusy(false); }
  }

  return <main className="shell">
    <header>
      <div><small>BLACKOUT / AUDITOR</small><h1>EVIDENCE</h1></div>
      <code>SCOPED ACCESS. NO FULL BOOKS.</code>
    </header>

    <section className="hero compactHero">
      <p>MILESTONES 14–15 / AUDITOR MODE</p>
      <h2>PROVE<br />BUSINESS.<br />MINIMIZE DATA.</h2>
      <span>Verify selected paid-invoice and threshold proofs without receiving a wallet export or complete transaction history.</span>
    </section>

    <div className="grid">
      <section className="panel">
        <h3>01 / LEDGER CONNECTION <b>{ready ? "READY" : "LOCKED"}</b></h3>
        <button disabled={busy} onClick={connect}>{wallet ? `CONNECTED / ${wallet.name}` : "CONNECT MIDNIGHT WALLET"}</button>
        <input type="password" autoComplete="off" placeholder="Private-state password (16+ chars)" value={password} onChange={(event) => setPassword(event.target.value)} />
        <input autoComplete="off" placeholder="Invoice contract address" value={contract} onChange={(event) => setContract(event.target.value)} />
        <button disabled={!wallet || busy || !contract.trim()} onClick={() => void join()}>JOIN CONTRACT</button>
      </section>

      <section className="panel">
        <h3>02 / PRIVACY BOUNDARY</h3>
        <p className="privacy">This is an auditor-scoped evidence bundle, not an aggregate zero-knowledge revenue proof. The verifier can resolve supplied proof IDs to public invoice identifiers. BLACKOUT does not label that stronger claim as implemented.</p>
      </section>

      <section className="panel wide">
        <h3>03 / BUSINESS EVIDENCE BUNDLE</h3>
        <textarea className="artifactInput" spellCheck={false} placeholder="Paste BusinessEvidenceBundle JSON" value={bundleText} onChange={(event) => setBundleText(event.target.value)} />
        <div className="flow"><button disabled={!ready || busy || !bundleText.trim()} onClick={() => void verifyBundle()}>VERIFY BUNDLE</button></div>
        {error && <p className="errorBox">FAIL CLOSED — {error}</p>}
      </section>

      <section className="panel wide terminal">
        <h3>04 / AUDIT RESULT <b>{result ? (result.valid ? "VALID" : "INVALID") : "NO RESULT"}</b></h3>
        {result ? <>
          <h2 className="resultTitle">{result.valid ? "BUSINESS EVIDENCE VERIFIED" : "EVIDENCE REJECTED"}</h2>
          <div className="log"><time>PAID</time><span>{result.distinctPaidInvoiceCount} distinct on-chain paid-invoice proofs</span></div>
          <div className="log"><time>THRESHOLD</time><span>{result.minimumIndividualAmountThresholds.length} individual amount-threshold proofs</span></div>
          {result.errors.map((value) => <div className="log" key={value}><time>ERROR</time><span>{value}</span></div>)}
        </> : <p>No business evidence verified yet.</p>}
      </section>
    </div>
  </main>;
}
