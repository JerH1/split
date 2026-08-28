import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useOutletContext } from "react-router";
import { Context } from "../pages/Session";
import { useDocumentTitle } from "../lib/useDocumentTitle";
import { initial, personColor } from "../lib/participantColors";
import PaymentSetup from "./PaymentSetup";
import ReadyToggle from "./ReadyToggle";
import SettleRow from "./SettleRow";
import { buildSummaryText, shareSummary } from "../lib/shareSummary";
import { useLocale } from "../lib/i18n/context";
import { formatMoney } from "../lib/money";

export default function Summary() {
  const { t } = useLocale();
  const context: Context = useOutletContext();
  const {
    session,
    currentParticipantId,
    participants: roster,
    isHost,
    isLocked,
    secret,
  } = context;

  useDocumentTitle(t("totals.documentTitle"));

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
  const [isEditingPayment, setIsEditingPayment] = useState(false);

  if (!totals) {
    return (
      <div role="status" className="text-center py-8">
        <div
          aria-hidden="true"
          className="mx-auto h-8 w-8 animate-spin rounded-full border-3 border-line-soft border-t-brand"
        ></div>
        <p className="mt-3 text-ink-2">{t("totals.loading")}</p>
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
    const heading = session.merchant
      ? t("share.headingMerchant", { merchant: session.merchant })
      : t("share.heading");

    const text = buildSummaryText(
      {
        people: participants.map((p) => ({
          name: p.name,
          total: p.total,
          paymentMethod: p.paymentMethod,
          paymentHandle: p.paymentHandle,
        })),
        merchant: session.merchant,
        code: session.code,
        billUrl,
        unclaimedTotal,
      },
      t,
    );

    const result = await shareSummary(text, heading);
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

  // The host is the one who usually put the whole bill on their card, so they
  // are the one everyone needs a handle for. Nothing asks them for it, and the
  // field is a tap inside their own row, so without this most bills end with
  // "what's your Venmo?" in a group chat - the thing this app exists to avoid.
  const shouldPromptForHandle =
    isHost &&
    me !== undefined &&
    me.paymentHandle === undefined &&
    participants.length > 1;

  function openPaymentEditor() {
    if (!me) return;
    setExpandedParticipant(me.participantId);
    setIsEditingPayment(true);
  }

  return (
    <div className="space-y-3 p-4">
      <h1 className="sr-only">{t("totals.documentTitle")}</h1>

      {/* Nudge the host to say how they get paid back */}
      {shouldPromptForHandle && !isEditingPayment && (
        <div className="flex flex-wrap items-center gap-2 rounded-tile border-card border-line bg-surface p-3 shadow-hard-sm">
          <span className="flex-1 text-sm font-semibold text-ink">
            {t("totals.addHandlePrompt")}
          </span>
          <button
            type="button"
            onClick={openPaymentEditor}
            className="inline-flex min-h-11 items-center rounded-full border-2 border-line bg-accent px-4 text-sm font-bold text-accent-ink shadow-hard-sm transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
          >
            {t("totals.addHandleAction")}
          </button>
        </div>
      )}

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
            {t("totals.unclaimedWarning", { count: unclaimedItems.length })}{" "}
            <span className="tabular font-bold">
              {formatMoney(unclaimedTotal)}
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
                aria-controls={`breakdown-${participant.participantId}`}
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
                  {/* A person can carry up to four badges (You, Host, Done,
                      Settled). On a narrow phone that overruns the amount, so
                      the badges wrap and the amount keeps its width. */}
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
                    <span className="font-display text-lg font-extrabold text-ink">
                      {participant.name}
                    </span>
                    {isCurrentUser && (
                      <span className="rounded-full bg-ink px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-page">
                        {t("totals.you")}
                      </span>
                    )}
                    {participant.isHost && (
                      <span className="rounded-full border-2 border-line px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-ink-2">
                        {t("totals.hostBadge")}
                      </span>
                    )}
                    {participant.isReady && (
                      <span
                        className="rounded-full border-2 border-line bg-surface px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-ink-2"
                        title={t("totals.doneClaimingTitle")}
                      >
                        {t("totals.doneBadge")}
                      </span>
                    )}
                    {participant.paidAt !== undefined && (
                      <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-accent-ink">
                        {t("totals.settledBadge")}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="tabular font-display text-xl font-extrabold text-ink">
                      {formatMoney(participant.total)}
                    </span>
                    <svg
                      aria-hidden="true"
                      className={`h-5 w-5 text-ink-4 transition-transform ${
                        isExpanded ? "rotate-180" : ""
                      }`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2.6}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>

                {/* Breakdown Row */}
                <div className="tabular mt-2 flex flex-wrap gap-x-3.5 gap-y-1 text-xs font-semibold text-ink-3">
                  <span>
                    {t("totals.itemsLine", {
                      amount: formatMoney(participant.subtotal),
                    })}
                  </span>
                  <span>
                    {t("totals.feesLine", {
                      amount: formatMoney(participant.tax),
                    })}
                  </span>
                  <span>
                    {t("totals.tipLine", {
                      amount: formatMoney(participant.tip),
                    })}
                  </span>
                </div>
              </button>

              {/* Expanded: Itemized List */}
              {isExpanded && (
                <div
                  id={`breakdown-${participant.participantId}`}
                  className="mx-3.5 border-t-2 border-line-soft pb-3.5 pt-3"
                >
                  <h2 className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-ink-3">
                    {t("totals.claimedItems")}
                  </h2>
                  {participant.claimedItems.length === 0 ? (
                    <p className="text-sm italic text-ink-3">
                      {t("totals.noneClaimed")}
                    </p>
                  ) : (
                    <ul className="space-y-1">
                      {participant.claimedItems.map((item, index) => (
                        <li
                          key={`${item.itemId}-${index}`}
                          className="flex justify-between gap-3 text-sm"
                        >
                          <span className="text-ink">
                            {item.itemName}
                            {item.claimCount > 1 && (
                              <span className="ml-1 text-ink-3">
                                {t("totals.splitCount", {
                                  count: item.claimCount,
                                })}
                              </span>
                            )}
                          </span>
                          <span className="tabular font-bold text-ink">
                            {formatMoney(item.sharePrice)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}

                  {/* Settle up */}
                  <div className="mt-3 space-y-2 border-t-2 border-line-soft pt-3">
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
                        billLabel={
                          session.merchant ??
                          t("home.billNamed", { code: session.code })
                        }
                      />
                    )}
                    {isCurrentUser && (
                      <PaymentSetup
                        participantId={participant.participantId}
                        secret={secret}
                        currentMethod={participant.paymentMethod}
                        currentHandle={participant.paymentHandle}
                        isEditing={isEditingPayment}
                        onEditingChange={setIsEditingPayment}
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
        <div className="flex items-center gap-3 rounded-card border-card border-total-line bg-total-bg p-4">
          <div className="flex flex-1 flex-col gap-0.5">
            <span className="font-display text-lg font-extrabold text-total-fg">
              {t("totals.tableTotal")}
            </span>
            {unclaimedTotal > 0 && (
              <span className="tabular text-xs font-medium text-total-muted">
                {t("totals.excludesUnclaimed", {
                  amount: formatMoney(unclaimedTotal),
                })}
              </span>
            )}
          </div>
          <span className="tabular font-display text-2xl font-extrabold text-accent">
            {formatMoney(groupTotal)}
          </span>
        </div>
      )}

      {/* Am I done claiming? */}
      {me && currentParticipantId && (
        <div className="space-y-2 rounded-card border-card border-line bg-surface p-4 shadow-hard-sm">
          <ReadyToggle
            participantId={currentParticipantId}
            secret={secret}
            isReady={me.isReady}
            disabled={isLocked}
          />
          {notReady.length > 0 && (
            <p className="text-sm text-ink-2">
              {t("totals.stillClaiming", {
                names: notReady.map((p) => p.name).join(", "),
              })}
            </p>
          )}
          {notReady.length === 0 && participants.length > 1 && (
            <p className="text-sm font-bold text-ink">
              {t("totals.everyoneDone")}
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
            className="min-h-12 w-full rounded-card border-card border-line bg-accent px-4 py-3 font-display text-lg font-extrabold text-accent-ink shadow-hard transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-page active:translate-x-1 active:translate-y-1 active:shadow-none"
          >
            {shareState === "copied"
              ? t("totals.shareCopied")
              : shareState === "failed"
                ? t("totals.shareFailed")
                : t("totals.share")}
          </button>

          {isHost && (
            <button
              type="button"
              onClick={handleToggleLock}
              className="min-h-12 w-full rounded-card border-card border-line bg-surface px-4 py-3 font-bold text-ink transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-page active:translate-y-px"
            >
              {isLocked ? t("totals.unlockBill") : t("totals.lockBill")}
            </button>
          )}
          {isHost && !isLocked && (
            <p className="text-center text-xs text-ink-3">
              {t("totals.lockingExplainer")}
            </p>
          )}
        </div>
      )}

      {/* Empty State */}
      {participants.length === 0 && (
        <div className="text-center py-8">
          <p className="text-ink-3">{t("totals.noParticipants")}</p>
        </div>
      )}
    </div>
  );
}
