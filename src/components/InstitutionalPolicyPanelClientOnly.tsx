"use client";

import dynamic from "next/dynamic";

const InstitutionalPolicyPanel = dynamic(() => import("./InstitutionalPolicyPanel"), { ssr: false });

export default function InstitutionalPolicyPanelClientOnly() {
  return <InstitutionalPolicyPanel />;
}
