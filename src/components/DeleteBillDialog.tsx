import { useEffect, useRef } from "react";

interface DeleteBillDialogProps {
  billLabel: string;
  isDeleting: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function DeleteBillDialog({
  billLabel,
  isDeleting,
  error,
  onConfirm,
  onCancel,
}: DeleteBillDialogProps) {
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  // Focus cancel first - the safe choice for a destructive dialog
  useEffect(() => {
    cancelButtonRef.current?.focus();
  }, []);

  // Escape closes the dialog, but not mid-delete
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !isDeleting) {
        onCancel();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isDeleting, onCancel]);

  // Click outside to dismiss, but not mid-delete
  function handleOverlayClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget && !isDeleting) {
      onCancel();
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
      onClick={handleOverlayClick}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-bill-title"
        className="bg-white rounded-lg w-full max-w-sm p-5"
      >
        <h2 id="delete-bill-title" className="text-lg font-semibold">
          Delete this bill?
        </h2>
        <p className="mt-2 text-sm text-gray-600">
          <span className="font-medium">{billLabel}</span> will be deleted for
          everyone in it, along with all items, claims, and the receipt photo.
          This can't be undone.
        </p>

        {error && (
          <p role="alert" className="mt-3 text-sm text-red-600">
            {error}
          </p>
        )}

        <div className="mt-5 flex gap-2">
          <button
            ref={cancelButtonRef}
            onClick={onCancel}
            disabled={isDeleting}
            className="flex-1 min-h-[44px] px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isDeleting}
            className="flex-1 min-h-[44px] px-4 py-2 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isDeleting ? "Deleting..." : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}
