"use client";

import dynamic from "next/dynamic";

const AuditorPortal = dynamic(() => import("./AuditorPortal"), { ssr: false });

export default function AuditorPortalClientOnly() {
  return <AuditorPortal />;
}
