import type { InvoiceStatus } from "./types";

const ALLOWED: Readonly<Record<InvoiceStatus, readonly InvoiceStatus[]>> = {
  CREATED: ["ACCEPTED", "CANCELLED"],
  ACCEPTED: ["FUNDED", "CANCELLED"],
  FUNDED: ["PAID", "REFUNDED"],
  PAID: [],
  CANCELLED: [],
  REFUNDED: [],
};

export function canTransitionInvoice(from: InvoiceStatus, to: InvoiceStatus): boolean {
  return ALLOWED[from].includes(to);
}

export function assertInvoiceTransition(from: InvoiceStatus, to: InvoiceStatus): void {
  if (!canTransitionInvoice(from, to)) throw new Error(`Invalid invoice transition: ${from} -> ${to}`);
}
