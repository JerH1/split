// convex/validation.ts
// Input validation helpers for security

// Max lengths for string inputs
export const MAX_NAME_LENGTH = 100;
export const MAX_ITEM_NAME_LENGTH = 200;

// Per-session resource caps. Nothing here is rate limited, so without ceilings
// a single caller holding one valid code could grow a bill without bound and
// make every session-scoped query (which collect() the whole table) expensive
// for everyone else in it.
export const MAX_PARTICIPANTS_PER_SESSION = 50;
export const MAX_ITEMS_PER_SESSION = 500;
export const MAX_FEES_PER_SESSION = 50;

// Receipt uploads. Convex hands the browser a direct upload URL that cannot
// itself enforce limits, so these are checked against the stored file's
// metadata before it is attached to a session.
export const MAX_RECEIPT_BYTES = 10 * 1024 * 1024; // 10 MB
export const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
] as const;

// Characters that render as nothing, or reorder what follows them. A name like
// "Alice\u202E" or one padded with zero-width spaces reads as another person's
// in the roster, which is impersonation in an app where the roster is the only
// thing identifying who owes what.
const INVISIBLE_OR_BIDI =
  // eslint-disable-next-line no-control-regex -- matching control characters is the whole point
  /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g;

/** Drop control, zero-width, and bidi-override characters from user text. */
export function stripInvisible(value: string): string {
  return value.replace(INVISIBLE_OR_BIDI, "");
}

/**
 * Fold a display name to the form used for duplicate detection.
 *
 * Compatibility normalization collapses lookalike encodings (fullwidth "Ａlice",
 * ligatures) onto the same key, so a second "Alice" cannot slip past the
 * uniqueness check by being spelled with different code points.
 */
export function normalizeNameForCompare(name: string): string {
  return stripInvisible(name).normalize("NFKC").trim().toLowerCase();
}

// Max value for money (in cents) - $100,000.00
export const MAX_MONEY_CENTS = 10_000_000;

// Max quantity for items
export const MAX_QUANTITY = 999;

// Validation functions that throw on invalid input
export function validateName(name: string, fieldName: string = "Name"): string {
  const trimmed = stripInvisible(name).trim();
  if (trimmed.length === 0) {
    throw new Error(`${fieldName} cannot be empty`);
  }
  if (trimmed.length > MAX_NAME_LENGTH) {
    throw new Error(`${fieldName} cannot exceed ${MAX_NAME_LENGTH} characters`);
  }
  return trimmed;
}

export function validateItemName(name: string): string {
  const trimmed = stripInvisible(name).trim();
  if (trimmed.length === 0) {
    throw new Error("Item name cannot be empty");
  }
  if (trimmed.length > MAX_ITEM_NAME_LENGTH) {
    throw new Error(
      `Item name cannot exceed ${MAX_ITEM_NAME_LENGTH} characters`,
    );
  }
  return trimmed;
}

export function validateMoney(
  cents: number,
  fieldName: string = "Amount",
): number {
  if (!Number.isFinite(cents)) {
    throw new Error(`${fieldName} must be a valid number`);
  }
  if (cents < 0) {
    throw new Error(`${fieldName} cannot be negative`);
  }
  if (cents > MAX_MONEY_CENTS) {
    throw new Error(`${fieldName} cannot exceed $100,000`);
  }
  if (!Number.isInteger(cents)) {
    throw new Error(`${fieldName} must be a whole number (cents)`);
  }
  return cents;
}

export function validateQuantity(quantity: number): number {
  if (!Number.isFinite(quantity)) {
    throw new Error("Quantity must be a valid number");
  }
  if (quantity < 1) {
    throw new Error("Quantity must be at least 1");
  }
  if (quantity > MAX_QUANTITY) {
    throw new Error(`Quantity cannot exceed ${MAX_QUANTITY}`);
  }
  if (!Number.isInteger(quantity)) {
    throw new Error("Quantity must be a whole number");
  }
  return quantity;
}

export function validateTipPercent(percent: number): number {
  if (!Number.isFinite(percent)) {
    throw new Error("Tip percent must be a valid number");
  }
  if (percent < 0) {
    throw new Error("Tip percent cannot be negative");
  }
  if (percent > 100) {
    throw new Error("Tip percent cannot exceed 100%");
  }
  return percent;
}

// Merchant is extracted from a receipt photo by the vision model, not typed
// by a person, so an over-long value is a parsing artifact rather than abuse.
// Truncate instead of throwing: rejecting the mutation would surface as a
// failed receipt scan and lose the items the user actually cares about.
export function validateMerchant(merchant: string): string {
  const trimmed = stripInvisible(merchant).trim();
  if (trimmed.length === 0) {
    throw new Error("Merchant cannot be empty");
  }
  return trimmed.slice(0, MAX_NAME_LENGTH);
}

// Payment handles end up inside a URL (venmo.com/..., cash.app/$..., paypal.me/...),
// so anything that could change the shape of that URL - slashes, whitespace,
// query separators - has to be rejected rather than escaped. The remaining
// character set covers every handle the supported services actually allow.
export const MAX_PAYMENT_HANDLE_LENGTH = 64;

const PAYMENT_HANDLE_PATTERN = /^[A-Za-z0-9._+-]+$/;

export function validatePaymentHandle(handle: string): string {
  // A leading @ is how people write their own handle, but it is never part of
  // the value the payment URLs expect.
  const trimmed = stripInvisible(handle).trim().replace(/^@+/, "");
  if (trimmed.length === 0) {
    throw new Error("Payment handle cannot be empty");
  }
  if (trimmed.length > MAX_PAYMENT_HANDLE_LENGTH) {
    throw new Error(
      `Payment handle cannot exceed ${MAX_PAYMENT_HANDLE_LENGTH} characters`,
    );
  }
  if (!PAYMENT_HANDLE_PATTERN.test(trimmed)) {
    throw new Error(
      "Payment handle can only contain letters, numbers, and . _ + -",
    );
  }
  return trimmed;
}
