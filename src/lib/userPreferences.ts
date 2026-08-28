/**
 * User preferences utility for localStorage-based persistence.
 *
 * These are the answers that are the same at every meal - what you are called,
 * and how people pay you back. They live on the device rather than in a bill so
 * that they survive one, and are copied onto each bill as it is joined.
 */

import { PaymentMethod, normalizePaymentHandle } from "./paymentLinks";

const STORAGE_KEY = "split_user_prefs";

interface UserPreferences {
  lastUsedName: string;
  paymentMethod?: PaymentMethod;
  paymentHandle?: string;
}

const PAYMENT_METHODS: PaymentMethod[] = [
  "venmo",
  "cashapp",
  "paypal",
  "other",
];

function readPreferences(): Partial<UserPreferences> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Partial<UserPreferences>;
  } catch {
    // localStorage can fail in private browsing mode or if storage is full
    return {};
  }
}

function writePreferences(update: Partial<UserPreferences>): void {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...readPreferences(), ...update }),
    );
  } catch {
    // Silently fail - preferences are a nice-to-have, not critical
  }
}

/**
 * Get the last used name from user preferences.
 * @returns The last used name if found, null otherwise
 */
export function getLastUsedName(): string | null {
  return readPreferences().lastUsedName || null;
}

/**
 * Save the last used name to user preferences.
 * @param name - The name to save
 */
export function setLastUsedName(name: string): void {
  writePreferences({ lastUsedName: name });
}

export interface PaymentPreference {
  method: PaymentMethod;
  handle: string;
}

/**
 * How this device says it gets paid back, or null if it has never been asked.
 *
 * Both halves are required: a handle with no method has nowhere to link to and
 * a method with no handle names nobody, which is the same rule the server
 * applies in `participants.setPaymentInfo`.
 */
export function getPaymentPreference(): PaymentPreference | null {
  const { paymentMethod, paymentHandle } = readPreferences();
  if (!paymentMethod || !paymentHandle) return null;
  // A hand-edited or half-written entry must not become a payment link.
  if (!PAYMENT_METHODS.includes(paymentMethod)) return null;
  const handle = normalizePaymentHandle(paymentHandle);
  if (handle === "") return null;
  return { method: paymentMethod, handle };
}

/** Remember how this person gets paid back, for every bill after this one. */
export function setPaymentPreference(
  method: PaymentMethod,
  handle: string,
): void {
  writePreferences({
    paymentMethod: method,
    paymentHandle: normalizePaymentHandle(handle),
  });
}

/** Forget it. Bills already carrying the handle keep it; new ones will not. */
export function clearPaymentPreference(): void {
  writePreferences({ paymentMethod: undefined, paymentHandle: undefined });
}
