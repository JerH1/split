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

/**
 * The name shown for a method. The three services are brands and read the same
 * in every language; only "Other" is a word, so the caller passes in its
 * translation rather than this module reaching for a React hook.
 */
export function paymentMethodLabel(
  method: PaymentMethod,
  otherLabel: string,
): string {
  return method === "other" ? otherLabel : PAYMENT_METHOD_LABELS[method];
}

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

/**
 * A link to the payee's profile, with no amount attached.
 *
 * `buildPaymentUrl` is the right link inside the app, where we know what the
 * reader owes. The shared summary is read by several people who each owe a
 * different amount, so it carries this one instead - a prefilled amount there
 * would be wrong for everyone but one person.
 */
export function buildProfileUrl(
  method: PaymentMethod,
  handle: string,
): string | null {
  const safeHandle = encodeURIComponent(handle);

  switch (method) {
    case "venmo":
      return `https://venmo.com/u/${safeHandle}`;
    case "cashapp":
      return `https://cash.app/$${safeHandle}`;
    case "paypal":
      return `https://paypal.me/${safeHandle}`;
    case "other":
      return null;
  }
}

/** Mirrors MAX_PAYMENT_HANDLE_LENGTH in convex/validation.ts. */
const MAX_HANDLE_LENGTH = 64;
/** Mirrors PAYMENT_HANDLE_PATTERN in convex/validation.ts. */
const HANDLE_PATTERN = /^[A-Za-z0-9._+-]+$/;

/**
 * The handle as it is stored: no leading @, no surrounding space.
 *
 * People write their own handle with the sigil their app shows them, and the
 * server strips it before storing. Doing the same here keeps a handle typed on
 * the home screen - which never reaches the server until a bill exists -
 * identical to one typed inside a bill.
 */
export function normalizePaymentHandle(handle: string): string {
  return handle.trim().replace(/^@+/, "");
}

/**
 * Whether the server would accept this handle.
 *
 * The server is still the authority; this exists so a handle saved on the home
 * screen fails in front of the person who typed it, rather than silently
 * failing to apply to a bill they open days later.
 */
export function isValidPaymentHandle(handle: string): boolean {
  const normalized = normalizePaymentHandle(handle);
  return (
    normalized.length > 0 &&
    normalized.length <= MAX_HANDLE_LENGTH &&
    HANDLE_PATTERN.test(normalized)
  );
}
