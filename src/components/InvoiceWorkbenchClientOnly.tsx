"use client";

import dynamic from "next/dynamic";

const InvoiceWorkbench = dynamic(() => import("./InvoiceWorkbench"), {
  ssr: false,
  loading: () => (
    <main className="shell">
      <header>
        <div><small>BLACKOUT / MIDNIGHT</small><h1>INVOICE</h1></div>
        <code>PROVE COMMERCE. REVEAL NOTHING ELSE.</code>
      </header>
      <section className="hero">
        <p>LIVE RUNTIME</p>
        <h2>LOADING<br/>PRIVATE<br/>CRYPTOGRAPHY.</h2>
        <span>Midnight runtime loads only in the browser.</span>
      </section>
    </main>
  ),
});

export default function InvoiceWorkbenchClientOnly() {
  return <InvoiceWorkbench />;
}
