const BYTES32_HEX = /^(?:0x)?[0-9a-fA-F]{64}$/;
export function hexToBytes32(value: string, label = "bytes32"): Uint8Array {
  if (!BYTES32_HEX.test(value)) throw new Error(`${label} must be exactly 32 bytes of hexadecimal data`);
  const hex = value.startsWith("0x") ? value.slice(2) : value;
  return Uint8Array.from({ length: 32 }, (_, i) => Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16));
}
export function bytesToHex(value: Uint8Array): string { return Array.from(value, b => b.toString(16).padStart(2, "0")).join(""); }
export function transactionBytesToHex(value: Uint8Array): string { return bytesToHex(value); }
export function transactionHexToBytes(value: string): Uint8Array {
  const clean = value.startsWith("0x") ? value.slice(2) : value;
  if (!clean || clean.length % 2 || !/^[0-9a-f]+$/i.test(clean)) throw new Error("Wallet returned an invalid serialized transaction");
  return Uint8Array.from({ length: clean.length / 2 }, (_, i) => Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16));
}
export function randomBytes32(): Uint8Array {
  if (typeof crypto === "undefined" || !crypto.getRandomValues) throw new Error("Secure browser randomness is unavailable");
  return crypto.getRandomValues(new Uint8Array(32));
}
