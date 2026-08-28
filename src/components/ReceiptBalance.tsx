import { Doc } from "../../convex/_generated/dataModel";
import { useT } from "../lib/i18n/context";
import { formatMoneyAbs } from "../lib/money";

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
  const t = useT();

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
      className="rounded-card border-card border-alert bg-alert-tint p-3 text-sm"
    >
      <p className="font-bold text-alert-ink">
        {t(isMissing ? "balance.missingTitle" : "balance.extraTitle", {
          amount: formatMoneyAbs(difference),
        })}
      </p>
      <p className="mt-1 text-ink-2">
        {t("balance.body", {
          receiptTotal: formatMoneyAbs(receiptTotal),
          accountedFor: formatMoneyAbs(accountedFor),
        })}{" "}
        {t(isMissing ? "balance.missingHint" : "balance.extraHint")}
      </p>
    </div>
  );
}
