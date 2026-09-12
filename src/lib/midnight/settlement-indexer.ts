const QUERY = `query TxPosition($offset: TransactionOffset!) { transactions(offset: $offset) { id ... on RegularTransaction { startIndex endIndex transactionResult { status } } } }`;
export async function captureCommitmentCandidates(indexerUri: string, txId: string): Promise<bigint[]> {
  const parsed = new URL(indexerUri); const local = ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname);
  if (parsed.protocol !== "https:" && !(local && parsed.protocol === "http:")) throw new Error("Midnight indexer must use HTTPS outside localhost");
  if (!/^[0-9a-f]{64}$/i.test(txId.replace(/^0x/i, ""))) throw new Error("Funding transaction identifier is invalid");
  let lastError: Error | undefined;
  for (let attempt = 0; attempt < 24; attempt++) {
    try {
      const response = await fetch(parsed.toString(), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: QUERY, variables: { offset: { identifier: txId.replace(/^0x/i, "") } } }), cache: "no-store", credentials: "omit" });
      if (!response.ok) throw new Error(`Indexer HTTP ${response.status}`);
      const body = await response.json() as { errors?: Array<{message?: string}>; data?: {transactions?: Array<{startIndex?: number; endIndex?: number; transactionResult?: {status?: string}}>} };
      if (body.errors?.length) throw new Error(body.errors.map(e => e.message ?? "indexer error").join("; "));
      const tx = body.data?.transactions?.[0]; if (tx) { const status = String(tx.transactionResult?.status ?? "").toUpperCase(); if (status && status !== "SUCCESS") throw new Error(`Funding status ${status}`); const start = Number(tx.startIndex), end = Number(tx.endIndex); if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end <= start) throw new Error("Invalid commitment-tree bounds"); const count = end - start; if (count > 32) throw new Error("Too many commitment candidates"); return Array.from({ length: count }, (_, i) => BigInt(start + i)); }
    } catch (error) { lastError = error instanceof Error ? error : new Error(String(error)); }
    await new Promise(resolve => window.setTimeout(resolve, 500));
  }
  throw lastError ?? new Error("Funding transaction not visible in indexer");
}
