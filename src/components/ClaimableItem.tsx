import { useState, useEffect, useRef } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id, Doc } from "../../convex/_generated/dataModel";
import { PublicParticipant } from "../pages/Session";
import { initial, personColor } from "../lib/participantColors";
import { useT } from "../lib/i18n/context";
import { formatMoney } from "../lib/money";

type ItemType = Doc<"items">;
type DraftItemType = Omit<ItemType, "_creationTime">;

interface ClaimableItemProps {
  item: ItemType | DraftItemType;
  claims: Doc<"claims">[];
  participants: PublicParticipant[];
  currentParticipantId: Id<"participants"> | null;
  /** The current user's secret. Every mutation below has to present it. */
  secret: string;
  isHost: boolean;
  // A locked bill is read-only: no claiming, no editing, no splitting.
  isLocked?: boolean;
  // Draft mode props - item is local only, not in DB yet
  isDraft?: boolean;
  onDraftSave?: (name: string, price: number, quantity: number) => void;
  onDraftCancel?: () => void;
  onDraftChange?: (name: string, price: number, quantity: number) => void;
}

export default function ClaimableItem({
  item,
  claims,
  participants,
  currentParticipantId,
  secret,
  isHost,
  isLocked = false,
  isDraft = false,
  onDraftSave,
  onDraftCancel,
  onDraftChange: _onDraftChange,
}: ClaimableItemProps) {
  const t = useT();

  // Check if current user has claimed this item
  const hasClaimed = currentParticipantId
    ? claims.some((c) => c.participantId === currentParticipantId)
    : false;

  // Edit mode state (drafts always start in edit mode, new items with empty name auto-enter edit mode)
  const [isEditing, setIsEditing] = useState(isDraft || item.name === "");

  // Local state for editing
  const [editName, setEditName] = useState(item.name);
  const [editPriceInput, setEditPriceInput] = useState(
    (item.price / 100).toFixed(2),
  );
  const [editQuantity, setEditQuantity] = useState(item.quantity);

  // Flash animation state for item updates
  const [isFlashing, setIsFlashing] = useState(false);
  const prevItemRef = useRef({ name: item.name, price: item.price });

  // Sync local state when item changes externally
  useEffect(() => {
    setEditName(item.name);
    setEditPriceInput((item.price / 100).toFixed(2));
    setEditQuantity(item.quantity);
  }, [item.name, item.price, item.quantity]);

  // Trigger flash animation when item name or price changes
  useEffect(() => {
    if (
      prevItemRef.current.name !== item.name ||
      prevItemRef.current.price !== item.price
    ) {
      setIsFlashing(true);
      const timer = setTimeout(() => setIsFlashing(false), 500);
      prevItemRef.current = { name: item.name, price: item.price };
      return () => clearTimeout(timer);
    }
  }, [item.name, item.price]);

  // Mutations
  const updateItem = useMutation(api.items.update);
  const removeItem = useMutation(api.items.remove);
  const claimItem = useMutation(api.claims.claim);
  const unclaimItem = useMutation(api.claims.unclaim);
  const unclaimByHost = useMutation(api.claims.unclaimByHost);
  const claimForEveryone = useMutation(api.claims.claimForEveryone);
  const unclaimEveryone = useMutation(api.claims.unclaimEveryone);

  // A shared plate is on everyone's tab. Worth its own control: doing this by
  // hand means every person hunting down the same row, and the split is wrong
  // until the last one gets there.
  const everyoneClaimed =
    participants.length > 0 && claims.length === participants.length;

  // Get claimer names
  const claimerNames = claims
    .map((c) => {
      const participant = participants.find((p) => p._id === c.participantId);
      return participant?.name ?? t("item.unknownPerson");
    })
    .sort();

  function handleEveryone(e: React.MouseEvent) {
    e.stopPropagation(); // Prevent claim toggle
    if (!currentParticipantId || isDraft) return;

    if (everyoneClaimed) {
      unclaimEveryone({
        itemId: item._id,
        participantId: currentParticipantId,
        secret,
      });
    } else {
      claimForEveryone({
        sessionId: item.sessionId,
        itemId: item._id,
        participantId: currentParticipantId,
        secret,
      });
    }
  }

  // Handle tap to toggle claim (disabled for drafts)
  function handleTap() {
    if (!currentParticipantId || isEditing || isDraft || isLocked) return;

    if (hasClaimed) {
      unclaimItem({
        itemId: item._id,
        participantId: currentParticipantId,
        callerParticipantId: currentParticipantId,
        secret,
      });
    } else {
      claimItem({
        sessionId: item.sessionId,
        itemId: item._id,
        participantId: currentParticipantId,
        secret,
      });
    }
  }

  // The row is a toggle, so it has to answer Enter and Space like a real
  // button does. Space is prevented so it doesn't scroll the page as well.
  function handleRowKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleTap();
    }
  }

  function handleEdit(e: React.MouseEvent) {
    e.stopPropagation(); // Prevent claim toggle
    setIsEditing(true);
  }

  function handleHostUnclaim(
    e: React.MouseEvent,
    participantId: Id<"participants">,
  ) {
    e.stopPropagation(); // Prevent claim toggle
    if (!currentParticipantId) return;
    unclaimByHost({
      itemId: item._id,
      participantId,
      hostParticipantId: currentParticipantId,
      secret,
    });
  }

  function handleCancel() {
    if (isDraft && onDraftCancel) {
      onDraftCancel();
    } else {
      // Reset to original values
      setEditName(item.name);
      setEditPriceInput((item.price / 100).toFixed(2));
      setEditQuantity(item.quantity);
      setIsEditing(false);
    }
  }

  async function handleSave() {
    const priceInCents = Math.round(parseFloat(editPriceInput) * 100) || 0;

    if (isDraft && onDraftSave) {
      onDraftSave(editName, priceInCents, editQuantity);
    } else {
      if (!currentParticipantId) return;
      await updateItem({
        itemId: item._id,
        participantId: currentParticipantId,
        secret,
        name: editName,
        price: priceInCents,
        quantity: editQuantity,
      });
      setIsEditing(false);
    }
  }

  async function handleDelete() {
    if (isDraft && onDraftCancel) {
      // For drafts, delete is the same as cancel - just remove local state
      onDraftCancel();
    } else if (currentParticipantId) {
      // Only host can delete items (enforced by backend), but UI shows delete to all editors
      await removeItem({
        itemId: item._id,
        participantId: currentParticipantId,
        secret,
      });
    }
  }

  // Edit mode - stacked layout for consistent behavior on mobile and desktop
  if (isEditing) {
    const editTarget = editName.trim() || t("item.newItemFallback");

    return (
      <div
        role="group"
        aria-label={
          isDraft ? t("item.newItem") : t("item.editAria", { name: editTarget })
        }
        className="flex flex-col gap-2.5 rounded-card border-card border-line bg-surface p-3 shadow-hard-sm"
      >
        {/* Row 1: Name input (full width) */}
        <input
          type="text"
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          placeholder={t("item.nameLabel")}
          aria-label={t("item.nameLabel")}
          className="w-full min-h-11 rounded-tile border-2 border-line bg-surface-sunk px-3 py-2 font-semibold text-ink placeholder:font-normal placeholder:text-ink-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        />

        {/* Row 2: Price + Quantity (if qty > 1) + Delete */}
        <div className="flex items-center gap-2">
          {/* Price input with $ prefix */}
          <div className="flex items-center gap-1 min-w-0">
            <span aria-hidden="true" className="font-bold text-ink-3">
              $
            </span>
            <input
              type="text"
              inputMode="decimal"
              value={editPriceInput}
              onChange={(e) =>
                setEditPriceInput(e.target.value.replace(/[^0-9.]/g, ""))
              }
              onFocus={(e) => e.target.select()}
              onBlur={(e) => {
                const value = parseFloat(e.target.value);
                if (!isNaN(value)) {
                  setEditPriceInput(value.toFixed(2));
                }
              }}
              aria-label={t("item.priceAria", { name: editTarget })}
              className="tabular w-24 min-h-11 rounded-tile border-2 border-line bg-surface-sunk px-3 py-2 font-semibold text-ink placeholder:font-normal placeholder:text-ink-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            />
          </div>

          {/* Quantity input - only shown if quantity > 1 */}
          {editQuantity > 1 && (
            <div className="flex items-center gap-1 min-w-0">
              <span aria-hidden="true" className="text-sm font-bold text-ink-3">
                x
              </span>
              <input
                type="number"
                value={editQuantity}
                onChange={(e) =>
                  setEditQuantity(parseInt(e.target.value, 10) || 1)
                }
                min="1"
                aria-label={t("item.quantityAria", { name: editTarget })}
                className="tabular w-14 min-h-11 rounded-tile border-2 border-line bg-surface-sunk px-3 py-2 font-semibold text-ink placeholder:font-normal placeholder:text-ink-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
              />
            </div>
          )}

          {/* Spacer to push delete button to right */}
          <div className="flex-1" />

          {/* Delete button */}
          <button
            type="button"
            onClick={handleDelete}
            className="flex min-h-11 min-w-11 items-center justify-center rounded-tile px-3 py-2 text-alert transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            aria-label={t("item.deleteAria", { name: editTarget })}
          >
            <svg
              aria-hidden="true"
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>

        {/* Row 3: Cancel + Save buttons (equal width) */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleCancel}
            className="min-h-11 min-w-0 flex-1 rounded-full border-2 border-line bg-surface px-3 py-2 font-bold text-ink transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus active:translate-y-px"
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="min-h-11 min-w-0 flex-1 rounded-full border-2 border-line bg-accent px-3 py-2 font-bold text-accent-ink shadow-hard-sm transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-page active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
          >
            {t("common.save")}
          </button>
        </div>
      </div>
    );
  }

  // View mode - tappable for claiming
  const canClaim = currentParticipantId !== null && !isLocked;
  const isUnclaimed = claimerNames.length === 0;
  // Splitting one item across one person is just claiming it.
  const showEveryone = canClaim && !isDraft && participants.length > 1;

  // Spoken name for the row. Without this a screen reader reads the raw
  // contents, including the nested "Edit item" button, as the toggle's label.
  const rowLabel = [
    `${item.name || t("item.unnamed")}, ${formatMoney(item.price)}`,
    item.quantity > 1 ? t("item.rowQuantity", { count: item.quantity }) : "",
    ". ",
    isUnclaimed
      ? t("item.rowNotClaimed")
      : t("item.rowClaimedBy", { names: claimerNames.join(", ") }),
  ].join("");

  const mineColor = personColor(participants, currentParticipantId);

  return (
    <div
      data-testid="item-row"
      onClick={canClaim ? handleTap : undefined}
      onKeyDown={canClaim ? handleRowKeyDown : undefined}
      role={canClaim ? "button" : undefined}
      tabIndex={canClaim ? 0 : undefined}
      aria-pressed={canClaim ? hasClaimed : undefined}
      aria-label={canClaim ? rowLabel : undefined}
      style={hasClaimed ? { borderColor: mineColor } : undefined}
      className={`rounded-card border-card p-3 transition-all duration-300 ${
        canClaim
          ? "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-page active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
          : ""
      } ${
        hasClaimed
          ? "bg-mine-tint shadow-hard-sm"
          : isUnclaimed
            ? "border-dashed border-alert bg-surface"
            : "border-line bg-surface shadow-hard-sm"
      } ${isFlashing ? "ring-2 ring-focus" : ""}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <span className="font-bold text-ink">{item.name}</span>
          {item.quantity > 1 && (
            <span className="ml-2 text-sm font-medium text-ink-3">
              ×{item.quantity}
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <span className="tabular font-display text-lg font-extrabold text-ink">
            {formatMoney(item.price)}
          </span>
          {!isLocked && (
            <button
              type="button"
              onClick={handleEdit}
              className="flex min-h-11 min-w-11 items-center justify-center rounded-tile p-2 text-ink-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
              aria-label={t("item.editAria", {
                name: item.name || t("item.genericItem"),
              })}
            >
              <svg
                aria-hidden="true"
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Claim controls and who has claimed share a row below the price, so a
          long item name keeps the full width of the one above it. */}
      {(showEveryone || claimerNames.length > 0) && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {showEveryone && (
            <button
              type="button"
              onClick={handleEveryone}
              aria-pressed={everyoneClaimed}
              className={`min-h-11 shrink-0 rounded-full px-3 text-xs font-bold transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus ${
                everyoneClaimed
                  ? "border-2 border-line bg-accent text-accent-ink shadow-hard-sm active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
                  : "border-2 border-line text-ink-2"
              }`}
            >
              {t("item.everyone")}
            </button>
          )}
          {claims.map((c) => {
            const participant = participants.find(
              (p) => p._id === c.participantId,
            );
            const name = participant?.name ?? t("item.unknownPerson");
            const color = personColor(participants, c.participantId);
            return (
              <span
                key={c._id}
                className="inline-flex items-center gap-1.5 rounded-full border-2 border-line bg-surface py-0.5 pl-0.5 pr-2 text-xs"
              >
                <span
                  aria-hidden="true"
                  className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-on-person"
                  style={{ background: color }}
                >
                  {initial(name)}
                </span>
                <span className="font-bold text-ink">{name}</span>
                {isHost && !isLocked && (
                  <button
                    type="button"
                    onClick={(e) => handleHostUnclaim(e, c.participantId)}
                    className="-my-1 -mr-1.5 rounded-full p-2 text-ink-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                    aria-label={t("item.removeClaimAria", {
                      name,
                      item: item.name || t("item.thisItem"),
                    })}
                  >
                    <svg
                      aria-hidden="true"
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-3 w-3"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fillRule="evenodd"
                        d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </button>
                )}
              </span>
            );
          })}
          {claims.length > 1 && (
            <span className="text-xs font-semibold text-ink-3">
              {t("item.eachAmount", {
                amount: formatMoney(item.price / claims.length),
              })}
            </span>
          )}
        </div>
      )}

      {/* Unclaimed indicator */}
      {claimerNames.length === 0 && canClaim && (
        <div aria-hidden="true" className="mt-1 text-sm font-bold text-alert">
          {t("item.tapToClaim")}
        </div>
      )}

      {/* Not joined indicator */}
      {!canClaim && (
        <div className="mt-1 text-sm italic text-ink-3">
          {t("item.joinToClaim")}
        </div>
      )}
    </div>
  );
}
