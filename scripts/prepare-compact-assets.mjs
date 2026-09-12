import { cp, mkdir, rm, stat } from "node:fs/promises";
const root = "contract/build", generated = "src/generated/invoice", publicRoot = "public/invoice";
const circuits = [
  "createInvoice", "acceptInvoice", "cancelInvoice", "fundInvoice", "payInvoice", "approveInvoiceRefund", "refundInvoice",
  "proveInvoiceExists", "proveInvoiceAccepted", "proveInvoicePaid", "proveAmountAtLeast",
  "registerMilestone", "fundMilestone", "releaseMilestone", "approveMilestoneRefund", "refundMilestone",
  "createAmountDisclosure", "createTaxDisclosure", "createDueDateDisclosure", "revokeDisclosure",
  "createReceipt",
];
async function req(path){ const info = await stat(path).catch(() => null); if (!info?.isFile() || info.size === 0) throw new Error(`Missing Compact asset: ${path}`); }
await req(`${root}/contract/index.js`); await req(`${root}/contract/index.d.ts`);
for (const circuit of circuits) { await req(`${root}/keys/${circuit}.prover`); await req(`${root}/keys/${circuit}.verifier`); await req(`${root}/zkir/${circuit}.bzkir`); }
await rm(generated,{recursive:true,force:true}); await rm(publicRoot,{recursive:true,force:true});
await mkdir(generated,{recursive:true}); await mkdir(`${publicRoot}/keys`,{recursive:true}); await mkdir(`${publicRoot}/zkir`,{recursive:true}); await mkdir(`${publicRoot}/compact`,{recursive:true});
await cp(`${root}/contract`, generated,{recursive:true}); await cp(`${root}/keys`,`${publicRoot}/keys`,{recursive:true}); await cp(`${root}/zkir`,`${publicRoot}/zkir`,{recursive:true}); await cp(`${root}/compiler/contract-info.json`,`${publicRoot}/compact/contract-info.json`);
console.log(`Prepared ${circuits.length} BLACKOUT INVOICE protocol v2 circuits.`);
