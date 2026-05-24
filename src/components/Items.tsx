import ReceiptCapture from "../components/ReceiptCapture";
import ClaimableItem from "../components/ClaimableItem";
import { useOutletContext } from "react-router";

export default function Items () {
  const context = useOutletContext();
  const {
    activeTab,
    participants,
    receiptState,
    handleReceiptUpload,
    handleRetry,
    items,
    session,
    draftItem,
    claims,
    currentParticipantId,
    isHost,
    groupSubtotal,
  } = context;

  return (
    <div className="p-4">
      {/* Items Tab */}
      <div>
        {/* Who's Here section */}
        {participants && participants.length > 0 && (
          <div className="mb-3">
            <h2 className="text-lg font-semibold mb-2">
              Who's Here ({participants.length})
            </h2>
            <div className="flex flex-wrap gap-1.5">
              {[...participants]
                .sort((a, b) => a.joinedAt - b.joinedAt)
                .map((participant) => (
                  <div
                    key={participant._id}
                    className="flex items-center gap-1 px-2 py-0.5 bg-gray-100 rounded-full text-sm"
                  >
                    <span className="font-medium">{participant.name}</span>
                    {participant.isHost && (
                      <span className="text-xs text-gray-500">(host)</span>
                    )}
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* Receipt section */}
        <div className="mb-3">
          <h2 className="text-lg font-semibold mb-2">Receipt</h2>

          {/* Idle state: show capture UI */}
          {receiptState.step === "idle" && (
            <div>
              {session.receiptImageId && (
                <div className="mb-3">
                  <p className="text-sm text-gray-600">
                    Receipt uploaded. Upload a new one to replace existing
                    items.
                  </p>
                  <button
                    onClick={() => setShowReceiptImage(true)}
                    className="text-sm text-blue-500 underline hover:text-blue-600"
                  >
                    View original receipt
                  </button>
                </div>
              )}
              <ReceiptCapture
                sessionId={session._id}
                onUpload={handleReceiptUpload}
              />
            </div>
          )}

          {/* Uploading state */}
          {receiptState.step === "uploading" && (
            <div className="text-center py-6">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
              <p className="mt-3 text-gray-600">Uploading...</p>
            </div>
          )}

          {/* Processing state */}
          {receiptState.step === "processing" && (
            <div className="text-center py-6">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
              <p className="mt-3 text-gray-600">Analyzing receipt...</p>
              <p className="text-sm text-gray-500 mt-1">
                Extracting items with AI
              </p>
            </div>
          )}

          {/* Error state */}
          {receiptState.step === "error" && (
            <div className="text-center py-6">
              <div className="text-red-500 mb-3">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-12 w-12 mx-auto"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              {receiptState.message.includes("\n\n") ? (
                <>
                  <p className="text-red-600 font-medium">
                    {receiptState.message.split("\n\n")[0]}
                  </p>
                  <p className="text-sm text-gray-600 mt-1">
                    {receiptState.message.split("\n\n")[1]}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-red-600 font-medium">
                    Something went wrong
                  </p>
                  <p className="text-sm text-gray-600 mt-1">
                    {receiptState.message}
                  </p>
                </>
              )}
              <button
                onClick={handleRetry}
                className="mt-4 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
              >
                Try Again
              </button>
            </div>
          )}
        </div>

        {/* Items list */}
        <div className="mb-3">
          <div className="flex flex-row justify-between">
            <h2 className="text-lg font-semibold mb-2">
              Items {items && items.length > 0 ? `(${items.length})` : ""}
            </h2>
            <div className="text-sm text-gray-400 pt-1">
              {session.merchant ? session.merchant : null}
            </div>
          </div>
          <div className="space-y-1">
            {items?.map((item) => (
              <ClaimableItem
                key={item._id}
                item={item}
                claims={(claims ?? []).filter((c) => c.itemId === item._id)}
                participants={participants ?? []}
                currentParticipantId={currentParticipantId}
                isHost={isHost}
              />
            ))}
          </div>

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
              isHost={isHost}
              isDraft={true}
              onDraftSave={handleDraftSave}
              onDraftCancel={handleDraftCancel}
              onDraftChange={handleDraftChange}
            />
          )}

          {/* Add item button - available to all participants */}
          <button
            onClick={() =>
              setDraftItem({ name: "", price: 0, quantity: 1 })
            }
            disabled={draftItem !== null}
            className={`w-full mt-2 py-3 px-4 border-2 border-dashed rounded-lg transition-colors ${
              draftItem !== null
                ? "border-gray-200 text-gray-400 cursor-not-allowed"
                : "border-gray-300 text-gray-600 hover:border-gray-400 hover:text-gray-700"
            }`}
          >
            + Add Item
          </button>

          {/* Items total */}
          {items && items.length > 0 && (
            <div className="mt-2 pt-2 border-t border-gray-200 flex justify-between items-center">
              <span className="font-medium">Items Total</span>
              <span className="font-semibold">
                ${(groupSubtotal / 100).toFixed(2)}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
