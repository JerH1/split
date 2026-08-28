import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import {
  PAYMENT_METHOD_LABELS,
  PaymentMethod,
  formatHandle,
} from "../lib/paymentLinks";

interface PaymentSetupProps {
  participantId: Id<"participants">;
  currentMethod: PaymentMethod | undefined;
  currentHandle: string | undefined;
}

const METHODS: PaymentMethod[] = ["venmo", "cashapp", "paypal", "other"];

/**
 * Where the person owed money says how to send it to them.
 *
 * Only ever rendered for yourself. Letting anyone edit anyone else's handle
 * would make redirecting a repayment a one-tap operation for a stranger who
 * guessed the bill code.
 */
export default function PaymentSetup({
  participantId,
  currentMethod,
  currentHandle,
}: PaymentSetupProps) {
  const setPaymentInfo = useMutation(api.participants.setPaymentInfo);

  const [isEditing, setIsEditing] = useState(false);
  const [method, setMethod] = useState<PaymentMethod>(currentMethod ?? "venmo");
  const [handle, setHandle] = useState(currentHandle ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function handleSave() {
    setIsSaving(true);
    setError(null);
    try {
      await setPaymentInfo({
        participantId,
        paymentMethod: method,
        paymentHandle: handle,
      });
      setIsEditing(false);
    } catch (err) {
      setError(
        err instanceof Error
          ? // Convex prefixes thrown errors with server context that means
            // nothing to a person staring at a text field.
            err.message.split("Uncaught Error:").pop()!.trim()
          : "Could not save that handle.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleRemove() {
    setIsSaving(true);
    setError(null);
    try {
      await setPaymentInfo({ participantId, paymentHandle: "" });
      setHandle("");
      setIsEditing(false);
    } finally {
      setIsSaving(false);
    }
  }

  if (!isEditing) {
    return (
      <button
        type="button"
        onClick={() => setIsEditing(true)}
        className="text-sm text-blue-600 underline hover:text-blue-700"
      >
        {currentHandle && currentMethod
          ? `Paid via ${PAYMENT_METHOD_LABELS[currentMethod]} ${formatHandle(currentMethod, currentHandle)} — change`
          : "+ Add how you get paid back"}
      </button>
    );
  }

  return (
    <div className="mt-2 space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {METHODS.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setMethod(option)}
            aria-pressed={method === option}
            className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
              method === option
                ? "bg-blue-600 text-white"
                : "bg-gray-200 text-gray-700 hover:bg-gray-300"
            }`}
          >
            {PAYMENT_METHOD_LABELS[option]}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <label className="sr-only" htmlFor={`handle-${participantId}`}>
          Your {PAYMENT_METHOD_LABELS[method]} handle
        </label>
        <input
          id={`handle-${participantId}`}
          type="text"
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          placeholder={method === "paypal" ? "your-paypal-name" : "your-handle"}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          className="flex-1 min-h-[44px] px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving || handle.trim() === ""}
          className="min-h-[44px] px-4 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:text-gray-500 transition-colors"
        >
          Save
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-3 text-sm">
        <button
          type="button"
          onClick={() => {
            setIsEditing(false);
            setError(null);
            setHandle(currentHandle ?? "");
          }}
          className="text-gray-600 underline hover:text-gray-800"
        >
          Cancel
        </button>
        {currentHandle && (
          <button
            type="button"
            onClick={handleRemove}
            disabled={isSaving}
            className="text-red-600 underline hover:text-red-700"
          >
            Remove
          </button>
        )}
      </div>
    </div>
  );
}
