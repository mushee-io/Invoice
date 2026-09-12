import type { InvoiceStatus } from "./types";

const ALLOWED: Readonly<Record<InvoiceStatus, readonly InvoiceStatus[]>> = {
  CREATED: ["ACCEPTED"],
  ACCEPTED: ["FUNDED"],
  FUNDED: ["PAID"],
  PAID: [],
};

export function canTransitionInvoice(from: InvoiceStatus, to: InvoiceStatus): boolean {
  return ALLOWED[from].includes(to);
}

export function assertInvoiceTransition(from: InvoiceStatus, to: InvoiceStatus): void {
  if (!canTransitionInvoice(from, to)) throw new Error(`Invalid invoice transition: ${from} -> ${to}`);
}
