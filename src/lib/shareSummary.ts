/**
 * Turning a finished split into something that can be pasted into a group chat.
 *
 * Without this the summary lives only on the screen of whoever is holding the
 * phone, and everyone else screenshots it - so the numbers stop being live and
 * nobody can tell a stale screenshot from a current one.
 */

export interface ShareablePerson {
  name: string;
  total: number; // cents
}

export interface ShareSummaryInput {
  people: ShareablePerson[];
  merchant?: string;
  code: string;
  billUrl: string;
  unclaimedTotal: number; // cents
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * Plain text, because it has to survive being pasted into any messaging app.
 * No markdown, no table alignment that a proportional font will destroy.
 */
export function buildSummaryText({
  people,
  merchant,
  code,
  billUrl,
  unclaimedTotal,
}: ShareSummaryInput): string {
  const heading = merchant ? `Split for ${merchant}` : "Bill split";
  const lines = people.map(
    (person) => `${person.name}: ${formatCents(person.total)}`,
  );

  const total = people.reduce((sum, person) => sum + person.total, 0);
  const parts = [heading, "", ...lines, "", `Total: ${formatCents(total)}`];

  // A summary that silently omits unclaimed items reads as complete when it is
  // not, so the gap is stated rather than left to be discovered later.
  if (unclaimedTotal > 0) {
    parts.push(`Unclaimed: ${formatCents(unclaimedTotal)} still to be split`);
  }

  parts.push("", `Open the bill: ${billUrl}`, `Code: ${code}`);
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
