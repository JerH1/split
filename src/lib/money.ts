/**
 * Money formatting.
 *
 * Deliberately *not* localized, and that is the whole point of the file.
 *
 * The app is used with a paper receipt sitting on the table. That receipt is
 * printed in US dollars with a leading "$" and a decimal point, and the bill's
 * amounts are stored as USD cents with no currency setting anywhere in the
 * schema. Formatting the same numbers as "12,50 $" for a German reader would
 * put the app and the paper in visible disagreement over what the total is,
 * while telling them nothing true — the currency did not change, only the
 * punctuation.
 *
 * So amounts render identically in every language. If the app ever grows a
 * real per-bill currency, this is the one function that has to learn about it.
 */
export function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/** Same, but for a difference where the sign is carried by the sentence. */
export function formatMoneyAbs(cents: number): string {
  return formatMoney(Math.abs(cents));
}
