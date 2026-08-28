import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import {
  PAYMENT_METHOD_LABELS,
  PaymentMethod,
  buildPaymentUrl,
  formatHandle,
} from "../lib/paymentLinks";

interface SettleRowProps {
  participantId: Id<"participants">;
  name: string;
  total: number; // cents
  paymentMethod: PaymentMethod | undefined;
  paymentHandle: string | undefined;
  paidAt: number | undefined;
  /** The viewer, for authorising the "mark paid" write. */
  currentParticipantId: Id<"participants">;
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
  isCurrentUser,
  isHost,
  billLabel,
}: SettleRowProps) {
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
              className="inline-flex items-center min-h-[44px] px-3 rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              Pay {name} ${(total / 100).toFixed(2)}
            </a>
          ) : (
            // "Other" has no deep link, so the handle itself is the useful thing.
            <span className="text-sm text-gray-700">
              Pay {name} via {formatHandle(paymentMethod, paymentHandle)}
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
              paid: !isPaid,
            })
          }
          aria-pressed={isPaid}
          className={`inline-flex items-center min-h-[44px] px-3 rounded-md text-sm font-medium transition-colors ${
            isPaid
              ? "bg-green-100 text-green-800 hover:bg-green-200"
              : "bg-gray-200 text-gray-700 hover:bg-gray-300"
          }`}
        >
          {isPaid ? "✓ Settled" : "Mark settled"}
        </button>
      )}

      {isPaid && !canMarkPaid && (
        <span className="inline-flex items-center px-2 py-1 rounded-full bg-green-100 text-green-800 text-xs font-medium">
          ✓ Settled
        </span>
      )}

      {!isCurrentUser && !paymentHandle && (
        <span className="text-sm text-gray-500 italic">
          {name} hasn't added a payment handle
        </span>
      )}

      {isCurrentUser && paymentMethod && paymentHandle && (
        <span className="text-sm text-gray-600">
          Others pay you at {PAYMENT_METHOD_LABELS[paymentMethod]}{" "}
          {formatHandle(paymentMethod, paymentHandle)}
        </span>
      )}
    </div>
  );
}
