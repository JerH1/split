import { Doc } from "../../convex/_generated/dataModel";

interface ReceiptBalanceProps {
  /** Grand total printed on the receipt, in cents. */
  receiptTotal: number | undefined;
  /** Sum of every line item, quantity included, in cents. */
  itemsSubtotal: number;
  fees: Doc<"fees">[];
}

// Receipt arithmetic is done to the cent, but OCR reads dollars and rounds, so
// a stray cent or two says nothing. Anything larger is a missing or misread
// line, which is worth interrupting for.
const TOLERANCE_CENTS = 2;

function formatCents(cents: number): string {
  return `$${(Math.abs(cents) / 100).toFixed(2)}`;
}

/**
 * Warn when the parsed items do not add up to the total printed on the receipt.
 *
 * The receipt's own total is the one number in the whole flow that was not
 * derived from OCR guesses about individual lines, so it is the only available
 * check on them. Without it, a dropped $12 appetizer just quietly makes
 * everyone's share too small and nobody finds out until the card is declined.
 */
export default function ReceiptBalance({
  receiptTotal,
  itemsSubtotal,
  fees,
}: ReceiptBalanceProps) {
  // No receipt total means no receipt was parsed, or the model could not read
  // one. Either way there is nothing to check against.
  if (receiptTotal === undefined) return null;

  const feesTotal = fees.reduce((sum, fee) => sum + fee.amount, 0);
  const accountedFor = itemsSubtotal + feesTotal;
  const difference = receiptTotal - accountedFor;

  if (Math.abs(difference) <= TOLERANCE_CENTS) return null;

  const isMissing = difference > 0;

  return (
    <div
      role="status"
      className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm"
    >
      <p className="font-medium text-amber-900">
        {isMissing
          ? `${formatCents(difference)} of this receipt isn't accounted for`
          : `Items add up to ${formatCents(difference)} more than the receipt`}
      </p>
      <p className="mt-1 text-amber-800">
        Receipt total {formatCents(receiptTotal)}, but items and fees come to{" "}
        {formatCents(accountedFor)}.{" "}
        {isMissing
          ? "Something may have been missed when the photo was read - check for a line that didn't make it."
          : "A line may have been read twice, or a price misread."}
      </p>
    </div>
  );
}
