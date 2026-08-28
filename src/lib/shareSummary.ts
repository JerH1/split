/**
 * Turning a finished split into something that can be pasted into a group chat.
 *
 * Without this the summary lives only on the screen of whoever is holding the
 * phone, and everyone else screenshots it - so the numbers stop being live and
 * nobody can tell a stale screenshot from a current one.
 */

import { formatMoney } from "./money";

export interface ShareablePerson {
  name: string;
  total: number; // cents
}

/**
 * The subset of the app's translate function this module needs.
 *
 * Passed in rather than imported: the summary is built for the person tapping
 * Share, in their language, and a plain function keeps this module testable
 * without standing up a React tree.
 */
export type Translate = (
  key:
    | "share.headingMerchant"
    | "share.heading"
    | "share.total"
    | "share.unclaimed"
    | "share.openBill"
    | "share.code",
  vars?: Record<string, string | number>,
) => string;

export interface ShareSummaryInput {
  people: ShareablePerson[];
  merchant?: string;
  code: string;
  billUrl: string;
  unclaimedTotal: number; // cents
}

/**
 * Plain text, because it has to survive being pasted into any messaging app.
 * No markdown, no table alignment that a proportional font will destroy.
 */
export function buildSummaryText(
  { people, merchant, code, billUrl, unclaimedTotal }: ShareSummaryInput,
  t: Translate,
): string {
  const heading = merchant
    ? t("share.headingMerchant", { merchant })
    : t("share.heading");
  const lines = people.map(
    (person) => `${person.name}: ${formatMoney(person.total)}`,
  );

  const total = people.reduce((sum, person) => sum + person.total, 0);
  const parts = [
    heading,
    "",
    ...lines,
    "",
    t("share.total", { amount: formatMoney(total) }),
  ];

  // A summary that silently omits unclaimed items reads as complete when it is
  // not, so the gap is stated rather than left to be discovered later.
  if (unclaimedTotal > 0) {
    parts.push(t("share.unclaimed", { amount: formatMoney(unclaimedTotal) }));
  }

  parts.push(
    "",
    t("share.openBill", { url: billUrl }),
    t("share.code", { code }),
  );
  return parts.join("\n");
}

/**
 * Hand the summary off to the OS share sheet, falling back to the clipboard
 * where there isn't one (most desktop browsers).
 *
 * Returns how it was shared so the caller can confirm the right thing - a
 * "Copied" toast after a share sheet, or silence after a copy, both read as bugs.
 */
export async function shareSummary(
  text: string,
  title: string,
): Promise<"shared" | "copied" | "failed"> {
  if (typeof navigator !== "undefined" && navigator.share) {
    try {
      await navigator.share({ title, text });
      return "shared";
    } catch (error) {
      // Dismissing the share sheet rejects with AbortError. That is a person
      // changing their mind, not a failure, and must not fall through to a
      // surprise clipboard write.
      if (error instanceof Error && error.name === "AbortError") {
        return "failed";
      }
    }
  }

  try {
    await navigator.clipboard.writeText(text);
    return "copied";
  } catch {
    return "failed";
  }
}
