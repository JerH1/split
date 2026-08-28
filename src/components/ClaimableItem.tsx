import { useState, useEffect, useRef } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id, Doc } from "../../convex/_generated/dataModel";
import { PublicParticipant } from "../pages/Session";

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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onDraftChange: _onDraftChange,
}: ClaimableItemProps) {
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
      return participant?.name ?? "Unknown";
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
    const editTarget = editName.trim() || "new item";

    return (
      <div
        role="group"
        aria-label={isDraft ? "New item" : `Edit ${editTarget}`}
        className="flex flex-col gap-2 p-3 bg-gray-50 rounded-lg"
      >
        {/* Row 1: Name input (full width) */}
        <input
          type="text"
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          placeholder="Item name"
          aria-label="Item name"
          className="w-full min-h-[44px] px-3 py-2 border border-gray-500 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
        />

        {/* Row 2: Price + Quantity (if qty > 1) + Delete */}
        <div className="flex items-center gap-2">
          {/* Price input with $ prefix */}
          <div className="flex items-center gap-1 min-w-0">
            <span aria-hidden="true" className="text-gray-600">
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
              aria-label={`Price for ${editTarget} in dollars`}
              className="w-24 min-h-[44px] px-3 py-2 border border-gray-500 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
            />
          </div>

          {/* Quantity input - only shown if quantity > 1 */}
          {editQuantity > 1 && (
            <div className="flex items-center gap-1 min-w-0">
              <span aria-hidden="true" className="text-gray-600 text-sm">
                x
              </span>
              <input
                type="number"
                value={editQuantity}
                onChange={(e) =>
                  setEditQuantity(parseInt(e.target.value, 10) || 1)
                }
                min="1"
                aria-label={`Quantity for ${editTarget}`}
                className="w-14 min-h-[44px] px-2 py-2 border border-gray-500 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
              />
            </div>
          )}

          {/* Spacer to push delete button to right */}
          <div className="flex-1" />

          {/* Delete button */}
          <button
            type="button"
            onClick={handleDelete}
            className="min-h-[44px] min-w-[44px] px-3 py-2 text-red-700 hover:bg-red-50 rounded-md transition-colors flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            aria-label={`Delete ${editTarget}`}
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
            className="flex-1 min-w-0 min-h-[44px] px-3 py-2 text-gray-800 bg-gray-200 hover:bg-gray-300 rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="flex-1 min-w-0 min-h-[44px] px-3 py-2 text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
          >
            Save
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
    `${item.name || "Unnamed item"}, $${(item.price / 100).toFixed(2)}`,
    item.quantity > 1 ? `, quantity ${item.quantity}` : "",
    ". ",
    isUnclaimed ? "Not claimed" : `Claimed by ${claimerNames.join(", ")}`,
  ].join("");

  return (
    <div
      onClick={canClaim ? handleTap : undefined}
      onKeyDown={canClaim ? handleRowKeyDown : undefined}
      role={canClaim ? "button" : undefined}
      tabIndex={canClaim ? 0 : undefined}
      aria-pressed={canClaim ? hasClaimed : undefined}
      aria-label={canClaim ? rowLabel : undefined}
      className={`p-3 rounded-lg transition-all duration-300 ${
        canClaim
          ? "cursor-pointer active:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
          : ""
      } ${
        hasClaimed
          ? "bg-blue-50 border-l-4 border-l-blue-500 border-y border-r border-y-blue-200 border-r-blue-200"
          : isUnclaimed
            ? "bg-gray-50 border border-dashed border-gray-400"
            : "bg-gray-50 border border-gray-200"
      } ${isFlashing ? "ring-2 ring-blue-400 ring-opacity-75" : ""}`}
    >
      <div className="flex justify-between items-center">
        <div>
          <span className="font-medium">{item.name}</span>
          {item.quantity > 1 && (
            <span className="text-gray-600 text-sm ml-2">x{item.quantity}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-gray-700">
            ${(item.price / 100).toFixed(2)}
          </span>
          {showEveryone && (
            <button
              type="button"
              onClick={handleEveryone}
              aria-pressed={everyoneClaimed}
              className={`min-h-[44px] px-2.5 rounded-md text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                everyoneClaimed
                  ? "bg-blue-600 text-white hover:bg-blue-700"
                  : "text-gray-600 hover:bg-gray-200"
              }`}
            >
              Everyone
            </button>
          )}
          {!isLocked && (
            <button
              type="button"
              onClick={handleEdit}
              className="min-h-[44px] min-w-[44px] p-2 text-gray-600 hover:bg-gray-200 rounded-md transition-colors flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
              aria-label={`Edit ${item.name || "item"}`}
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

      {/* Claimer names */}
      {claimerNames.length > 0 && (
        <div className="mt-2 text-sm text-gray-700 flex flex-wrap gap-1">
          {claims.map((c) => {
            const participant = participants.find(
              (p) => p._id === c.participantId,
            );
            const name = participant?.name ?? "Unknown";
            const isCurrentUser = c.participantId === currentParticipantId;
            return (
              <span
                key={c._id}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${
                  isCurrentUser
                    ? "bg-blue-100 text-blue-700 font-medium"
                    : "bg-gray-200 text-gray-700"
                }`}
              >
                {name}
                {isHost && !isLocked && (
                  <button
                    type="button"
                    onClick={(e) => handleHostUnclaim(e, c.participantId)}
                    className="hover:bg-gray-300 rounded-full p-2 -my-1 -mr-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                    aria-label={`Remove ${name}'s claim on ${item.name || "this item"}`}
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
        </div>
      )}

      {/* Unclaimed indicator */}
      {claimerNames.length === 0 && canClaim && (
        <div aria-hidden="true" className="mt-2 text-sm text-gray-600 italic">
          Tap to claim
        </div>
      )}

      {/* Not joined indicator */}
      {!canClaim && (
        <div className="mt-2 text-sm text-gray-600 italic">
          Join to claim items
        </div>
      )}
    </div>
  );
}
