export type MidnightNetwork = "preview" | "preprod";
export function getInvoicePublicConfig() {
  const value = (process.env.NEXT_PUBLIC_MIDNIGHT_NETWORK ?? "preview").toLowerCase();
  if (value !== "preview" && value !== "preprod") throw new Error(`Unsupported Midnight network: ${value}`);
  return { network: value as MidnightNetwork, contractAddress: process.env.NEXT_PUBLIC_BLACKOUT_INVOICE_CONTRACT_ADDRESS?.trim() ?? "" };
}
