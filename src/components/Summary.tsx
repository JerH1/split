import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useOutletContext } from "react-router";
import { Context } from "../pages/Session";
import { useDocumentTitle } from "../lib/useDocumentTitle";
import PaymentSetup from "./PaymentSetup";
import ReadyToggle from "./ReadyToggle";
import SettleRow from "./SettleRow";
import { buildSummaryText, shareSummary } from "../lib/shareSummary";

export default function Summary() {
  const context: Context = useOutletContext();
  const { session, currentParticipantId, isHost, isLocked, secret } = context;

  useDocumentTitle("Totals");

  const totals = useQuery(api.participants.getTotals, {
    sessionId: session._id,
  });
  const setLocked = useMutation(api.sessions.setLocked);
  const [expandedParticipant, setExpandedParticipant] = useState<string | null>(
    null,
  );
  const [shareState, setShareState] = useState<"idle" | "copied" | "failed">(
    "idle",
  );

  if (!totals) {
    return (
      <div role="status" className="text-center py-8">
        <div
          aria-hidden="true"
          className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"
        ></div>
        <p className="mt-3 text-gray-600">Loading totals...</p>
      </div>
    );
  }

  const { participants, unclaimedItems, unclaimedTotal, groupSubtotal } =
    totals;

  // Calculate group total
  const groupTotal = participants.reduce((sum, p) => sum + p.total, 0);

  const me = participants.find((p) => p.participantId === currentParticipantId);
  const notReady = participants.filter((p) => !p.isReady);

  function toggleExpand(participantId: string) {
    setExpandedParticipant((prev) =>
      prev === participantId ? null : participantId,
    );
  }

  async function handleShare() {
    const billUrl = `${window.location.origin}/bill/${session.code}`;
    const text = buildSummaryText({
      people: participants.map((p) => ({ name: p.name, total: p.total })),
      merchant: session.merchant,
      code: session.code,
      billUrl,
      unclaimedTotal,
    });

    const result = await shareSummary(
      text,
      session.merchant ? `Split for ${session.merchant}` : "Bill split",
    );
    // A native share sheet is its own confirmation; a silent clipboard write
    // is not, so only that case needs feedback.
    if (result === "copied" || result === "failed") {
      setShareState(result);
      setTimeout(() => setShareState("idle"), 2000);
    }
  }

  async function handleToggleLock() {
    if (!currentParticipantId) return;
    await setLocked({
      sessionId: session._id,
      participantId: currentParticipantId,
      secret,
      locked: !isLocked,
    });
  }

  return (
    <div className="p-4 space-y-4">
      <h1 className="sr-only">Totals</h1>

      {/* Unclaimed Warning */}
      {unclaimedItems.length > 0 && (
        <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
          <div className="flex items-center gap-2">
            <svg
              aria-hidden="true"
              className="w-5 h-5 text-yellow-700"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <span className="text-yellow-800 font-medium">
              {unclaimedItems.length} item{unclaimedItems.length > 1 ? "s" : ""}{" "}
              unclaimed (${(unclaimedTotal / 100).toFixed(2)})
            </span>
          </div>
        </div>
      )}

      {/* Participant Cards */}
      <div className="space-y-3">
        {participants.map((participant) => {
          const isCurrentUser =
            participant.participantId === currentParticipantId;
          const isExpanded = expandedParticipant === participant.participantId;

          return (
            <div
              key={participant.participantId}
              className={`rounded-lg border-2 transition-colors ${
                isCurrentUser
                  ? "border-blue-500 bg-blue-50"
                  : "border-gray-200 bg-white"
              }`}
            >
              {/* Card Header - Clickable */}
              <button
                type="button"
                onClick={() => toggleExpand(participant.participantId)}
                aria-expanded={isExpanded}
                aria-controls={`breakdown-${participant.participantId}`}
                className="w-full p-4 text-left rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-800">
                      {participant.name}
                    </span>
                    {isCurrentUser && (
                      <span className="text-xs bg-blue-600 text-white px-2 py-0.5 rounded-full">
                        You
                      </span>
                    )}
                    {participant.isHost && (
                      <span className="text-xs bg-gray-500 text-white px-2 py-0.5 rounded-full">
                        Host
                      </span>
                    )}
                    {participant.isReady && (
                      <span
                        className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full"
                        title="Done claiming"
                      >
                        ✓ Done
                      </span>
                    )}
                    {participant.paidAt !== undefined && (
                      <span className="text-xs bg-green-600 text-white px-2 py-0.5 rounded-full">
                        Settled
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xl font-bold text-gray-900">
                      ${(participant.total / 100).toFixed(2)}
                    </span>
                    <svg
                      aria-hidden="true"
                      className={`w-5 h-5 text-gray-600 transition-transform ${
                        isExpanded ? "rotate-180" : ""
                      }`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                  </div>
                </div>

                {/* Breakdown Row */}
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm text-gray-600">
                  <span>Items ${(participant.subtotal / 100).toFixed(2)}</span>
                  <span aria-hidden="true" className="text-gray-400">
                    |
                  </span>
                  <span>
                    Taxes & Fees ${(participant.tax / 100).toFixed(2)}
                  </span>
                  <span aria-hidden="true" className="text-gray-400">
                    |
                  </span>
                  <span>Tip ${(participant.tip / 100).toFixed(2)}</span>
                </div>
              </button>

              {/* Expanded: Itemized List */}
              {isExpanded && (
                <div
                  id={`breakdown-${participant.participantId}`}
                  className="px-4 pb-4 border-t border-gray-200 mt-2 pt-3"
                >
                  <h2 className="text-sm font-medium text-gray-700 mb-2">
                    Claimed Items
                  </h2>
                  {participant.claimedItems.length === 0 ? (
                    <p className="text-sm text-gray-600 italic">
                      No items claimed yet
                    </p>
                  ) : (
                    <ul className="space-y-1">
                      {participant.claimedItems.map((item, index) => (
                        <li
                          key={`${item.itemId}-${index}`}
                          className="flex justify-between text-sm"
                        >
                          <span className="text-gray-700">
                            {item.itemName}
                            {item.claimCount > 1 && (
                              <span className="text-gray-600 ml-1">
                                (split {item.claimCount} ways)
                              </span>
                            )}
                          </span>
                          <span className="text-gray-600 font-medium">
                            ${(item.sharePrice / 100).toFixed(2)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}

                  {/* Settle up */}
                  <div className="mt-3 pt-3 border-t border-gray-200 space-y-2">
                    {currentParticipantId && (
                      <SettleRow
                        participantId={participant.participantId}
                        name={participant.name}
                        total={participant.total}
                        paymentMethod={participant.paymentMethod}
                        paymentHandle={participant.paymentHandle}
                        paidAt={participant.paidAt}
                        secret={secret}
                        currentParticipantId={currentParticipantId}
                        isCurrentUser={isCurrentUser}
                        isHost={isHost}
                        billLabel={session.merchant ?? `Bill ${session.code}`}
                      />
                    )}
                    {isCurrentUser && (
                      <PaymentSetup
                        participantId={participant.participantId}
                        secret={secret}
                        currentMethod={participant.paymentMethod}
                        currentHandle={participant.paymentHandle}
                      />
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Group Total */}
      {groupSubtotal > 0 && (
        <div className="p-4 bg-gray-100 rounded-lg">
          <div className="flex justify-between items-center">
            <span className="font-semibold text-gray-800">Group Total</span>
            <span className="text-xl font-bold text-gray-900">
              ${(groupTotal / 100).toFixed(2)}
            </span>
          </div>
          {unclaimedTotal > 0 && (
            <p className="mt-1 text-sm text-gray-700">
              Excludes ${(unclaimedTotal / 100).toFixed(2)} in unclaimed items
            </p>
          )}
        </div>
      )}

      {/* Am I done claiming? */}
      {me && currentParticipantId && (
        <div className="p-4 bg-white border border-gray-200 rounded-lg space-y-2">
          <ReadyToggle
            participantId={currentParticipantId}
            secret={secret}
            isReady={me.isReady}
            disabled={isLocked}
          />
          {notReady.length > 0 && (
            <p className="text-sm text-gray-600">
              Still claiming: {notReady.map((p) => p.name).join(", ")}
            </p>
          )}
          {notReady.length === 0 && participants.length > 1 && (
            <p className="text-sm text-green-700 font-medium">
              Everyone's done claiming — these totals are final.
            </p>
          )}
        </div>
      )}

      {/* Share + lock */}
      {participants.length > 0 && (
        <div className="space-y-2 mb-20">
          <button
            type="button"
            onClick={handleShare}
            className="w-full min-h-[44px] py-3 px-4 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            {shareState === "copied"
              ? "Copied to clipboard"
              : shareState === "failed"
                ? "Couldn't share — try again"
                : "Share the split"}
          </button>

          {isHost && (
            <button
              type="button"
              onClick={handleToggleLock}
              className="w-full min-h-[44px] py-3 px-4 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors"
            >
              {isLocked ? "Unlock this bill" : "Lock this bill"}
            </button>
          )}
          {isHost && !isLocked && (
            <p className="text-xs text-gray-500 text-center">
              Locking freezes items and claims so nothing changes after people
              pay.
            </p>
          )}
        </div>
      )}

      {/* Empty State */}
      {participants.length === 0 && (
        <div className="text-center py-8">
          <p className="text-gray-600">No participants yet</p>
        </div>
      )}
    </div>
  );
}
