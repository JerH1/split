import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useOutletContext } from "react-router";
import { Context } from "../pages/Session";
import { useDocumentTitle } from "../lib/useDocumentTitle";
import { initial, personColor } from "../lib/participantColors";

export default function Summary() {
  const context: Context = useOutletContext();
  const { session, currentParticipantId, participants: roster } = context;

  useDocumentTitle("Totals");

  const totals = useQuery(api.participants.getTotals, {
    sessionId: session._id,
  });
  const [expandedParticipant, setExpandedParticipant] = useState<string | null>(
    null,
  );

  if (!totals) {
    return (
      <div role="status" className="text-center py-8">
        <div
          aria-hidden="true"
          className="mx-auto h-8 w-8 animate-spin rounded-full border-3 border-line-soft border-t-brand"
        ></div>
        <p className="mt-3 text-ink-2">Loading totals...</p>
      </div>
    );
  }

  const { participants, unclaimedItems, unclaimedTotal, groupSubtotal } =
    totals;

  // Calculate group total
  const groupTotal = participants.reduce((sum, p) => sum + p.total, 0);

  function toggleExpand(participantId: string) {
    setExpandedParticipant((prev) =>
      prev === participantId ? null : participantId,
    );
  }

  return (
    <div className="space-y-3 p-4">
      {/* Unclaimed Warning */}
      {unclaimedItems.length > 0 && (
        <div className="flex items-center gap-2 rounded-tile border-card border-alert bg-alert-tint p-3">
          <svg
            aria-hidden="true"
            className="h-5 w-5 shrink-0 text-alert"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.4}
            strokeLinecap="round"
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8v5M12 17h.01" />
          </svg>
          <span className="text-sm font-semibold text-alert-ink">
            {unclaimedItems.length} item{unclaimedItems.length > 1 ? "s" : ""}{" "}
            still up for grabs —{" "}
            <span className="tabular font-bold">
              ${(unclaimedTotal / 100).toFixed(2)}
            </span>
          </span>
        </div>
      )}

      {/* Participant Cards */}
      <div className="space-y-3">
        {participants.map((participant) => {
          const isCurrentUser =
            participant.participantId === currentParticipantId;
          const isExpanded = expandedParticipant === participant.participantId;
          const color = personColor(roster ?? [], participant.participantId);

          return (
            <div
              key={participant.participantId}
              data-testid="participant-card"
              style={isCurrentUser ? { borderColor: color } : undefined}
              className={`rounded-card border-card shadow-hard-sm transition-colors ${
                isCurrentUser ? "bg-mine-tint" : "border-line bg-surface"
              }`}
            >
              {/* Card Header - Clickable */}
              <button
                type="button"
                onClick={() => toggleExpand(participant.participantId)}
                aria-expanded={isExpanded}
                className="w-full rounded-card p-3.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus"
              >
                <div className="flex items-center gap-2.5">
                  <span
                    aria-hidden="true"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-card border-line text-sm font-bold text-on-person"
                    style={{ background: color }}
                  >
                    {initial(participant.name)}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                    <span className="font-display text-lg font-extrabold text-ink">
                      {participant.name}
                    </span>
                    {isCurrentUser && (
                      <span className="rounded-full bg-ink px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-page">
                        You
                      </span>
                    )}
                    {participant.isHost && (
                      <span className="rounded-full border-2 border-line px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-ink-2">
                        Host
                      </span>
                    )}
                  </div>
                  <span className="tabular font-display text-xl font-extrabold text-ink">
                    ${(participant.total / 100).toFixed(2)}
                  </span>
                  <svg
                    aria-hidden="true"
                    className={`h-5 w-5 shrink-0 text-ink-4 transition-transform ${
                      isExpanded ? "rotate-180" : ""
                    }`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2.6}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </div>

                {/* Breakdown Row */}
                <div className="tabular mt-2 flex flex-wrap gap-x-3.5 gap-y-1 text-xs font-semibold text-ink-3">
                  <span>Items ${(participant.subtotal / 100).toFixed(2)}</span>
                  <span>Tax ${(participant.tax / 100).toFixed(2)}</span>
                  <span>Tip ${(participant.tip / 100).toFixed(2)}</span>
                </div>
              </button>

              {/* Expanded: Itemized List */}
              {isExpanded && (
                <div className="mx-3.5 border-t-2 border-line-soft px-0 pb-3.5 pt-3">
                  <h4 className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-ink-3">
                    Claimed Items
                  </h4>
                  {participant.claimedItems.length === 0 ? (
                    <p className="text-sm italic text-ink-3">
                      No items claimed yet
                    </p>
                  ) : (
                    <ul className="space-y-1.5">
                      {participant.claimedItems.map((item, index) => (
                        <li
                          key={`${item.itemId}-${index}`}
                          className="flex justify-between gap-3 text-sm"
                        >
                          <span className="text-ink">
                            {item.itemName}
                            {item.claimCount > 1 && (
                              <span className="ml-1 text-ink-3">
                                · split {item.claimCount}
                              </span>
                            )}
                          </span>
                          <span className="tabular font-bold text-ink">
                            ${(item.sharePrice / 100).toFixed(2)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Group Total */}
      {groupSubtotal > 0 && (
        <div className="flex items-center gap-3 rounded-card border-card border-total-line bg-total-bg p-4">
          <div className="flex flex-1 flex-col gap-0.5">
            <span className="font-display text-lg font-extrabold text-total-fg">
              Table total
            </span>
            {unclaimedTotal > 0 && (
              <span className="tabular text-xs font-medium text-total-muted">
                excludes ${(unclaimedTotal / 100).toFixed(2)} unclaimed
              </span>
            )}
          </div>
          <span className="tabular font-display text-2xl font-extrabold text-accent">
            ${(groupTotal / 100).toFixed(2)}
          </span>
        </div>
      )}

      {/* Empty State */}
      {participants.length === 0 && (
        <div className="py-8 text-center">
          <p className="text-ink-3">No participants yet</p>
        </div>
      )}
    </div>
  );
}
