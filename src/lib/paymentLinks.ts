/**
 * Deep links to the payment apps people actually use to settle a bill.
 *
 * These only ever open a prefilled payment screen. Nothing here moves money -
 * the amount, the recipient and the send button all belong to the payment app,
 * which is the only place that should be asking.
 */

export type PaymentMethod = "venmo" | "cashapp" | "paypal" | "other";

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  venmo: "Venmo",
  cashapp: "Cash App",
  paypal: "PayPal",
  other: "Other",
};

/** How a handle is written when shown back to a person, per service convention. */
export function formatHandle(method: PaymentMethod, handle: string): string {
  switch (method) {
    case "venmo":
      return `@${handle}`;
    case "cashapp":
      return `$${handle}`;
    default:
      return handle;
  }
}

function toDollars(cents: number): string {
  return (cents / 100).toFixed(2);
}

/**
 * A URL that opens the payer's app with the payment prefilled, or null when the
 * service has no such link ("other" is a handle to type in by hand).
 *
 * Handles are validated server-side against a URL-safe character set, but they
 * are encoded here too: this function should not depend on a validator running
 * somewhere else to produce a safe URL.
 */
export function buildPaymentUrl(
  method: PaymentMethod,
  handle: string,
  amountCents: number,
  note: string,
): string | null {
  const safeHandle = encodeURIComponent(handle);
  const amount = toDollars(amountCents);

  switch (method) {
    case "venmo":
      return (
        "https://venmo.com/?txn=pay&audience=private" +
        `&recipients=${safeHandle}` +
        `&amount=${amount}` +
        `&note=${encodeURIComponent(note)}`
      );
    case "cashapp":
      return `https://cash.app/$${safeHandle}/${amount}`;
    case "paypal":
      return `https://paypal.me/${safeHandle}/${amount}`;
    case "other":
      return null;
  }
}
