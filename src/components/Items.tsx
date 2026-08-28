import { useState } from "react";
import { useOutletContext } from "react-router";
import { useAction, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import ReceiptCapture from "../components/ReceiptCapture";
import ClaimableItem from "../components/ClaimableItem";
import ReceiptImageViewer from "../components/ReceiptImageViewer";
import { updateMerchantNameInBillHistory } from "../lib/billHistory";
import { useDocumentTitle } from "../lib/useDocumentTitle";
import { Context } from "../pages/Session";
import { initial, personColorVar } from "../lib/participantColors";

// Receipt processing state machine
type ReceiptState =
  | { step: "idle" }
  | { step: "uploading" }
  | { step: "processing"; storageId: Id<"_storage"> }
  | { step: "error"; message: string };

// Confidence threshold for handwritten tip pre-fill (higher than receipt validation)
const HANDWRITTEN_TIP_CONFIDENCE_THRESHOLD = 0.8;

// Map rejection reasons to user-friendly error messages
const REJECTION_MESSAGES: Record<string, { title: string; hint: string }> = {
  landscape_photo: {
    title: "This doesn't look like a receipt",
    hint: "Try taking a photo of your receipt instead",
  },
  document: {
    title: "This looks like a document, not a receipt",
    hint: "Make sure you're photographing a store receipt",
  },
  blurry: {
    title: "The image is too blurry",
    hint: "Try taking another photo with better lighting",
  },
  other: {
    title: "We couldn't recognize this as a receipt",
    hint: "Try taking a clearer photo of your receipt",
  },
};

export default function Items() {
  const context: Context = useOutletContext();
  const {
    participants,
    items,
    session,
    claims,
    currentParticipantId,
    isHost,
    groupSubtotal,
    secret,
  } = context;

  useDocumentTitle(session?.merchant ? `Items - ${session.merchant}` : "Items");

  // Draft item state - local only until saved
  const [draftItem, setDraftItem] = useState<{
    name: string;
    price: number;
    quantity: number;
  } | null>(null);

  const [receiptState, setReceiptState] = useState<ReceiptState>({
    step: "idle",
  });

  const [showReceiptImage, setShowReceiptImage] = useState(false);

  // Parse receipt action and mutations for saving items directly
  const parseReceipt = useAction(api.actions.parseReceipt.parseReceipt);
  const addBulk = useMutation(api.items.addBulk);
  const addBulkFees = useMutation(api.fees.addBulk);
  const updateTip = useMutation(api.sessions.updateTip);
  const addItem = useMutation(api.items.add);
  const updateMerchant = useMutation(api.sessions.updateMerchant);

  // Handle receipt upload - triggers OCR processing and saves items directly
  async function handleReceiptUpload(storageId: Id<"_storage">) {
    if (!session) return;
    setReceiptState({ step: "processing", storageId });

    try {
      if (!currentParticipantId) {
        throw new Error("Must be joined to upload receipt");
      }
      const result = await parseReceipt({
        sessionId: session._id,
        participantId: currentParticipantId,
        secret,
        storageId,
      });

      if ("error" in result) {
        // Check for validation rejection (non-receipt)
        if ("rejection_reason" in result && result.rejection_reason) {
          const msg =
            REJECTION_MESSAGES[result.rejection_reason] ||
            REJECTION_MESSAGES.other;
          setReceiptState({
            step: "error",
            message: `${msg.title}\n\n${msg.hint}`,
          });
          return;
        }
        // Existing parse error handling
        const rawPreview =
          "raw" in result && result.raw
            ? `\n\nRaw response: ${result.raw.slice(0, 500)}`
            : "";
        setReceiptState({
          step: "error",
          message: `OCR failed: ${result.error}.${rawPreview}`,
        });
        return;
      }

      // Convert prices from dollars to cents and save items directly
      const itemsInCents = result.items.map((item) => ({
        name: item.name,
        price: Math.round(item.price * 100),
        quantity: item.quantity,
      }));

      await addBulk({
        sessionId: session._id,
        items: itemsInCents,
        participantId: currentParticipantId,
        secret,
      });

      // Trim before the truthiness check: OCR can return whitespace-only
      // text, which is truthy but would be rejected by the mutation and
      // fail the whole scan after the items above were already saved.
      const merchant = result.merchant?.trim();
      if (merchant) {
        await updateMerchant({
          sessionId: session._id,
          participantId: currentParticipantId,
          secret,
          merchant,
        });
        if (session.code) {
          updateMerchantNameInBillHistory(session.code, merchant);
        }
      }

      // Add fees from receipt (convert to cents)
      if (result.fees && result.fees.length > 0) {
        const feesInCents = result.fees.map((fee) => ({
          label: fee.label,
          amount: Math.round(fee.amount * 100),
        }));
        await addBulkFees({
          sessionId: session._id,
          participantId: currentParticipantId,
          secret,
          fees: feesInCents,
        });
      }

      // Pre-fill tip from handwritten detection (silent - no toast per user decision)
      if (
        "handwritten_tip" in result &&
        result.handwritten_tip?.detected &&
        result.handwritten_tip.amount !== null &&
        result.handwritten_tip.confidence >=
          HANDWRITTEN_TIP_CONFIDENCE_THRESHOLD
      ) {
        await updateTip({
          sessionId: session._id,
          tipType: "manual",
          tipValue: Math.round(result.handwritten_tip.amount * 100), // convert dollars to cents
          participantId: currentParticipantId,
          secret,
        });
      }

      // Reset to idle - items are now visible via real-time query
      setReceiptState({ step: "idle" });
    } catch (error) {
      setReceiptState({
        step: "error",
        message:
          error instanceof Error ? error.message : "Unknown error occurred",
      });
    }
  }

  // Handle retry after error
  function handleRetry() {
    setReceiptState({ step: "idle" });
  }

  // Draft item handlers
  async function handleDraftSave(
    name: string,
    price: number,
    quantity: number,
  ) {
    if (!session || !currentParticipantId) return;
    await addItem({
      sessionId: session._id,
      participantId: currentParticipantId,
      secret,
      name,
      price,
      quantity,
    });
    setDraftItem(null);
  }

  function handleDraftCancel() {
    setDraftItem(null);
  }

  function handleDraftChange(name: string, price: number, quantity: number) {
    setDraftItem({ name, price, quantity });
  }

  const sortedParticipants = [...(participants ?? [])].sort(
    (a, b) => a.joinedAt - b.joinedAt,
  );
  const claimedItemIds = new Set((claims ?? []).map((c) => c.itemId));
  const unclaimedCount = (items ?? []).filter(
    (item) => !claimedItemIds.has(item._id),
  ).length;

  return (
    <div className="space-y-4 p-4">
      <h1 className="sr-only">Items</h1>

      {/* Merchant, once the receipt has told us who we are eating at */}
      {session.merchant && (
        <h2 className="font-display text-xl font-extrabold leading-[1.3] text-ink">
          {session.merchant}
        </h2>
      )}

      {/* Who's Here section */}
      {sortedParticipants.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-xs font-bold uppercase tracking-[0.16em] text-ink-3">
            Who's Here ({sortedParticipants.length})
          </h2>
          <div className="flex flex-wrap gap-2">
            {sortedParticipants.map((participant, index) => (
              <div
                key={participant._id}
                className="flex items-center gap-1.5 rounded-full border-card border-line bg-surface py-0.5 pl-0.5 pr-3 text-sm"
              >
                <span
                  aria-hidden="true"
                  className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-line text-[11px] font-bold text-on-person"
                  style={{ background: personColorVar(index) }}
                >
                  {initial(participant.name)}
                </span>
                <span className="font-bold text-ink">{participant.name}</span>
                {participant.isHost && (
                  <span className="text-xs font-semibold text-ink-3">host</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Receipt section */}
      <div className="space-y-2">
        <h2 className="text-xs font-bold uppercase tracking-[0.16em] text-ink-3">
          Receipt
        </h2>

        {/* Idle state: show capture UI */}
        {receiptState.step === "idle" && (
          <div className="space-y-2">
            {session.receiptImageId && (
              <div className="flex items-center gap-3 rounded-card border-card border-line bg-surface p-2.5 shadow-hard-sm">
                <span
                  aria-hidden="true"
                  className="h-11 w-9 shrink-0 rounded-md border-2 border-line"
                  style={{
                    background:
                      "repeating-linear-gradient(180deg, var(--surface-sunk) 0 3px, var(--line-soft) 3px 4px)",
                  }}
                />
                <p className="flex-1 text-sm text-ink-2">
                  Receipt scanned. Scanning another replaces every item.
                </p>
                <button
                  type="button"
                  onClick={() => setShowReceiptImage(true)}
                  className="min-h-11 shrink-0 rounded-full border-2 border-line px-3 text-xs font-bold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                >
                  View
                </button>
              </div>
            )}
            {/* Scanning a receipt replaces every item on the bill, so it is
                host-only server-side. Showing the buttons to guests would
                only produce an upload the next step rejects. */}
            {isHost ? (
              <ReceiptCapture
                sessionId={session._id}
                participantId={currentParticipantId}
                secret={secret}
                onUpload={handleReceiptUpload}
              />
            ) : (
              <p className="text-sm text-ink-2">
                Only the host can scan a receipt for this bill.
              </p>
            )}
          </div>
        )}

        {/* Uploading state */}
        {receiptState.step === "uploading" && (
          <div role="status" className="py-6 text-center">
            <div
              aria-hidden="true"
              className="mx-auto h-8 w-8 animate-spin rounded-full border-3 border-line-soft border-t-brand"
            ></div>
            <p className="mt-3 text-ink-2">Uploading...</p>
          </div>
        )}

        {/* Processing state */}
        {receiptState.step === "processing" && (
          <div role="status" className="py-6 text-center">
            <div
              aria-hidden="true"
              className="mx-auto h-8 w-8 animate-spin rounded-full border-3 border-line-soft border-t-brand"
            ></div>
            <p className="mt-3 font-semibold text-ink">Analyzing receipt...</p>
            <p className="mt-1 text-sm text-ink-2">Extracting items with AI</p>
          </div>
        )}

        {/* Error state */}
        {receiptState.step === "error" && (
          <div
            role="alert"
            className="rounded-card border-card border-alert bg-alert-tint p-4 text-center"
          >
            <svg
              aria-hidden="true"
              xmlns="http://www.w3.org/2000/svg"
              className="mx-auto mb-2 h-9 w-9 text-alert"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2.2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            {receiptState.message.includes("\n\n") ? (
              <>
                <p className="font-bold text-alert-ink">
                  {receiptState.message.split("\n\n")[0]}
                </p>
                <p className="mt-1 text-sm text-ink-2">
                  {receiptState.message.split("\n\n")[1]}
                </p>
              </>
            ) : (
              <>
                <p className="font-bold text-alert-ink">Something went wrong</p>
                <p className="mt-1 text-sm text-ink-2">
                  {receiptState.message}
                </p>
              </>
            )}
            <button
              type="button"
              onClick={handleRetry}
              className="mt-4 min-h-11 rounded-full border-card border-line bg-accent px-5 font-bold text-accent-ink shadow-hard-sm transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-page active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
            >
              Try Again
            </button>
          </div>
        )}
      </div>

      {/* Items list */}
      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <h2 className="text-xs font-bold uppercase tracking-[0.16em] text-ink-3">
            Items {items && items.length > 0 ? `(${items.length})` : ""}
          </h2>
          {unclaimedCount > 0 && (
            <span className="text-xs font-bold text-alert">
              {unclaimedCount} up for grabs
            </span>
          )}
        </div>

        <div className="space-y-2.5">
          {items?.map((item) => (
            <ClaimableItem
              key={item._id}
              item={item}
              claims={(claims ?? []).filter((c) => c.itemId === item._id)}
              participants={participants ?? []}
              currentParticipantId={currentParticipantId}
              secret={secret}
              isHost={isHost}
            />
          ))}

          {/* Draft item - local only until saved */}
          {draftItem && (
            <ClaimableItem
              item={{
                _id: "" as Id<"items">,
                sessionId: session._id,
                name: draftItem.name,
                price: draftItem.price,
                quantity: draftItem.quantity,
              }}
              claims={[]}
              participants={participants ?? []}
              currentParticipantId={currentParticipantId}
              secret={secret}
              isHost={isHost}
              isDraft={true}
              onDraftSave={handleDraftSave}
              onDraftCancel={handleDraftCancel}
              onDraftChange={handleDraftChange}
            />
          )}
        </div>

        {/* Add item button - available to all participants */}
        <button
          type="button"
          onClick={() => setDraftItem({ name: "", price: 0, quantity: 1 })}
          disabled={draftItem !== null}
          className={`min-h-12 w-full rounded-card border-card border-dashed py-3 px-4 font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-page ${
            draftItem !== null
              ? "cursor-not-allowed border-ink-4 text-ink-4"
              : "border-line text-ink"
          }`}
        >
          + Add Item
        </button>

        {/* Items total */}
        {items && items.length > 0 && (
          <div className="flex items-center justify-between border-t-2 border-line-soft pt-3">
            <span className="font-bold text-ink-2">Items Total</span>
            <span className="tabular font-display text-xl font-extrabold text-ink">
              ${(groupSubtotal / 100).toFixed(2)}
            </span>
          </div>
        )}
      </div>

      {/* Receipt Image Viewer Modal */}
      {session.receiptImageId && showReceiptImage && (
        <ReceiptImageViewer
          sessionId={session._id}
          storageId={session.receiptImageId}
          onClose={() => setShowReceiptImage(false)}
        />
      )}
    </div>
  );
}
