import { useEffect, useRef } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";

interface ReceiptImageViewerProps {
  sessionId: Id<"sessions">;
  storageId: Id<"_storage">;
  onClose: () => void;
}

export default function ReceiptImageViewer({
  sessionId,
  storageId,
  onClose,
}: ReceiptImageViewerProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  const imageUrl = useQuery(api.receipts.getReceiptUrl, {
    sessionId,
    storageId,
  });

  // showModal() puts the dialog in the top layer: focus moves into it and is
  // trapped, the page behind is inert and hidden from screen readers, and
  // focus returns to the trigger on close. Same pattern as DeleteBillDialog.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;
    dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, []);

  // Escape fires "cancel" on a modal dialog. preventDefault so React state
  // stays the single source of truth for whether we are open.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    function handleCancel(e: Event) {
      e.preventDefault();
      onClose();
    }

    dialog.addEventListener("cancel", handleCancel);
    return () => dialog.removeEventListener("cancel", handleCancel);
  }, [onClose]);

  // The dialog fills the viewport, so a click that lands on the dialog itself
  // (rather than the image or a button) is a backdrop click.
  function handleBackdropClick(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }

  return (
    <dialog
      ref={dialogRef}
      onClick={handleBackdropClick}
      aria-label="Original receipt"
      className="m-0 h-full max-h-none w-full max-w-none bg-transparent p-0 backdrop:bg-black/80 flex items-center justify-center"
    >
      {/* Close button */}
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 p-2 text-white hover:text-gray-300 rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        aria-label="Close receipt"
      >
        <svg
          aria-hidden="true"
          xmlns="http://www.w3.org/2000/svg"
          className="h-8 w-8"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </button>

      {/* Loading state */}
      {imageUrl === undefined && (
        <div role="status" className="text-white">
          <div
            aria-hidden="true"
            className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto"
          ></div>
          <p className="mt-3">Loading image...</p>
        </div>
      )}

      {/* Image not found */}
      {imageUrl === null && (
        <div className="text-white text-center">
          <p role="alert">Image not found</p>
          <button
            type="button"
            onClick={onClose}
            className="mt-4 min-h-[44px] px-4 py-2 bg-white/20 rounded-lg hover:bg-white/30 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            Close
          </button>
        </div>
      )}

      {/* Image display */}
      {imageUrl && (
        <img
          src={imageUrl}
          alt="Original receipt for this bill"
          className="max-w-[90vw] max-h-[85vh] object-contain"
        />
      )}
    </dialog>
  );
}
