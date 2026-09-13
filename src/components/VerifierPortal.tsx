"use client";

import { useState } from "react";
import { connectMidnightWallet, type ConnectedWallet } from "@/lib/midnight/wallet";
import { initializeInvoiceRuntime, verifyDisclosureArtifactOnChain, verifyReceiptOnChain } from "@/lib/midnight/runtime";
import { parseDisclosureArtifactJson, parseReceiptArtifactJson } from "@/lib/institutional/artifacts";

type Mode = "RECEIPT" | "DISCLOSURE";

type VerificationResult = {
  valid: boolean;
  summary: string;
  details: string[];
};

export default function VerifierPortal() {
  const [wallet, setWallet] = useState<ConnectedWallet | null>(null);
  const [contract, setContract] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<Mode>("RECEIPT");
  const [artifact, setArtifact] = useState("");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<VerificationResult | null>(null);

  async function connect() {
    setBusy(true); setError("");
    try {
      const connected = await connectMidnightWallet();
      setWallet(connected);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally { setBusy(false); }
  }

  async function join() {
    if (!wallet) throw new Error("Connect a compatible Midnight wallet first");
    setBusy(true); setError(""); setResult(null);
    try {
      await initializeInvoiceRuntime({ wallet, privateStatePassword: password, mode: "join", contractAddress: contract });
      setReady(true);
    } catch (cause) {
      setReady(false);
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally { setBusy(false); }
  }

  async function verify() {
    if (!ready) throw new Error("Join the deployed invoice contract before verification");
    setBusy(true); setError(""); setResult(null);
    try {
      if (mode === "RECEIPT") {
        const parsed = parseReceiptArtifactJson(artifact);
        const checked = await verifyReceiptOnChain(parsed);
        setResult({
          valid: checked.valid,
          summary: checked.valid ? "PAID RECEIPT VERIFIED" : "RECEIPT INVALID",
          details: [
            `invoice status: ${checked.status}`,
            `invoice commitment: ${checked.invoiceCommitmentHex}`,
            "exact amount, parties and line items remain outside this verifier artifact",
          ],
        });
      } else {
        const parsed = parseDisclosureArtifactJson(artifact);
        const checked = await verifyDisclosureArtifactOnChain(parsed);
        setResult({
          valid: checked.valid,
          summary: checked.valid ? `${parsed.field} DISCLOSURE VERIFIED` : "DISCLOSURE INVALID",
          details: [
            `revoked: ${checked.revoked ? "yes" : "no"}`,
            `expired locally: ${checked.expiredLocally ? "yes" : "no"}`,
            `invoice commitment: ${checked.invoiceCommitmentHex}`,
          ],
        });
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally { setBusy(false); }
  }

  return <main className="shell">
    <header>
      <div><small>BLACKOUT / VERIFY</small><h1>PORTAL</h1></div>
      <code>VERIFY THE CLAIM. NOT THE WHOLE BUSINESS.</code>
    </header>

    <section className="hero compactHero">
      <p>MILESTONES 10–13 / VERIFIER SURFACE</p>
      <h2>CHECK.<br />DON&apos;T<br />EXPOSE.</h2>
      <span>Receipt and selective-disclosure verification against the deployed Midnight ledger state.</span>
    </section>

    <div className="grid">
      <section className="panel">
        <h3>01 / CONNECTION <b>{ready ? "LEDGER READY" : wallet ? "WALLET READY" : "OFFLINE"}</b></h3>
        <button disabled={busy} onClick={connect}>{wallet ? `CONNECTED / ${wallet.name}` : "CONNECT MIDNIGHT WALLET"}</button>
        <input type="password" autoComplete="off" placeholder="Private-state password (16+ chars)" value={password} onChange={(event) => setPassword(event.target.value)} />
        <input autoComplete="off" placeholder="Invoice contract address" value={contract} onChange={(event) => setContract(event.target.value)} />
        <button disabled={!wallet || busy || !contract.trim()} onClick={() => void join()}>JOIN CONTRACT</button>
      </section>

      <section className="panel">
        <h3>02 / ARTIFACT TYPE</h3>
        <div className="flow">
          <button disabled={busy} onClick={() => { setMode("RECEIPT"); setResult(null); }}>PRIVATE RECEIPT</button>
          <button disabled={busy} onClick={() => { setMode("DISCLOSURE"); setResult(null); }}>SELECTIVE DISCLOSURE</button>
        </div>
        <p className="privacy">Strict parsing rejects malformed IDs, zero commitments, invalid openings and malformed transaction identifiers before ledger verification starts.</p>
      </section>

      <section className="panel wide">
        <h3>03 / {mode}</h3>
        <textarea className="artifactInput" spellCheck={false} placeholder={`Paste ${mode.toLowerCase()} JSON artifact`} value={artifact} onChange={(event) => setArtifact(event.target.value)} />
        <div className="flow"><button disabled={!ready || busy || !artifact.trim()} onClick={() => void verify()}>VERIFY AGAINST MIDNIGHT</button></div>
        {error && <p className="errorBox">FAIL CLOSED — {error}</p>}
      </section>

      <section className="panel wide terminal">
        <h3>04 / RESULT <b>{result ? (result.valid ? "VALID" : "INVALID") : "NO RESULT"}</b></h3>
        {result ? <>
          <h2 className="resultTitle">{result.summary}</h2>
          {result.details.map((detail) => <div className="log" key={detail}><time>{result.valid ? "PASS" : "CHECK"}</time><span>{detail}</span></div>)}
        </> : <p>No artifact verified yet.</p>}
      </section>
    </div>
  </main>;
}
