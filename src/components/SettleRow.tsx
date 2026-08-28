import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import {
  PaymentMethod,
  buildPaymentUrl,
  formatHandle,
  paymentMethodLabel,
} from "../lib/paymentLinks";
import { useT } from "../lib/i18n/context";
import { formatMoney } from "../lib/money";

interface SettleRowProps {
  participantId: Id<"participants">;
  name: string;
  total: number; // cents
  paymentMethod: PaymentMethod | undefined;
  paymentHandle: string | undefined;
  paidAt: number | undefined;
  /** The viewer, for authorising the "mark paid" write. */
  currentParticipantId: Id<"participants">;
  /** The viewer's secret, which is what actually proves that authorisation. */
  secret: string;
  isCurrentUser: boolean;
  isHost: boolean;
  /** What the payment note should say, e.g. "Joe's Diner". */
  billLabel: string;
}

/**
 * The settle-up controls for one person: how to pay them, and whether they have
 * been paid.
 *
 * The app works out exactly who owes what and then, without this, stops - which
 * is the point where everyone gives up and argues in a group chat instead.
 */
export default function SettleRow({
  participantId,
  name,
  total,
  paymentMethod,
  paymentHandle,
  paidAt,
  currentParticipantId,
  secret,
  isCurrentUser,
  isHost,
  billLabel,
}: SettleRowProps) {
  const t = useT();
  const setPaid = useMutation(api.participants.setPaid);

  const isPaid = paidAt !== undefined;
  // Only the person owed money, or the host reconciling at the end, should be
  // able to declare a share settled.
  const canMarkPaid = isCurrentUser || isHost;

  const paymentUrl =
    paymentMethod && paymentHandle
      ? buildPaymentUrl(paymentMethod, paymentHandle, total, billLabel)
      : null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Paying yourself is not a thing, so the link is only for other people. */}
      {!isCurrentUser && paymentMethod && paymentHandle && (
        <>
          {paymentUrl ? (
            <a
              href={paymentUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center rounded-full border-2 border-line bg-accent px-4 text-sm font-bold text-accent-ink shadow-hard-sm transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-page active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
            >
              {t("settle.payAmount", { name, amount: formatMoney(total) })}
            </a>
          ) : (
            // "Other" has no deep link, so the handle itself is the useful thing.
            <span className="text-sm text-ink-2">
              {t("settle.payVia", {
                name,
                handle: formatHandle(paymentMethod, paymentHandle),
              })}
            </span>
          )}
        </>
      )}

      {canMarkPaid && (
        <button
          type="button"
          onClick={() =>
            setPaid({
              participantId,
              callerParticipantId: currentParticipantId,
              secret,
              paid: !isPaid,
            })
          }
          aria-pressed={isPaid}
          className={`inline-flex min-h-11 items-center rounded-full border-2 border-line px-4 text-sm font-bold transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus ${
            isPaid
              ? "bg-accent text-accent-ink shadow-hard-sm active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
              : "bg-surface text-ink-2 active:translate-y-px"
          }`}
        >
          {isPaid ? t("settle.settled") : t("settle.markSettled")}
        </button>
      )}

      {isPaid && !canMarkPaid && (
        <span className="inline-flex items-center rounded-full bg-accent px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-accent-ink">
          {t("settle.settledBadge")}
        </span>
      )}

      {!isCurrentUser && !paymentHandle && (
        <span className="text-sm italic text-ink-3">
          {t("settle.noHandle", { name })}
        </span>
      )}

      {isCurrentUser && paymentMethod && paymentHandle && (
        <span className="text-sm text-ink-2">
          {t("settle.othersPayYou", {
            method: paymentMethodLabel(paymentMethod, t("settle.methodOther")),
            handle: formatHandle(paymentMethod, paymentHandle),
          })}
        </span>
      )}
    </div>
  );
}
