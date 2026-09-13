"use client";

import dynamic from "next/dynamic";

const VerifierPortal = dynamic(() => import("./VerifierPortal"), { ssr: false });

export default function VerifierPortalClientOnly() {
  return <VerifierPortal />;
}
