import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import {
  PaymentMethod,
  formatHandle,
  paymentMethodLabel,
} from "../lib/paymentLinks";
import { useT } from "../lib/i18n/context";

interface PaymentSetupProps {
  participantId: Id<"participants">;
  /** The current user's secret. Only they can set their own payment details. */
  secret: string;
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
  secret,
  currentMethod,
  currentHandle,
}: PaymentSetupProps) {
  const t = useT();
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
        secret,
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
          : t("settle.couldNotSave"),
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleRemove() {
    setIsSaving(true);
    setError(null);
    try {
      await setPaymentInfo({ participantId, secret, paymentHandle: "" });
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
        className="min-h-11 text-sm font-bold text-ink underline decoration-2 underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
      >
        {currentHandle && currentMethod
          ? t("settle.paidViaChange", {
              method: paymentMethodLabel(
                currentMethod,
                t("settle.methodOther"),
              ),
              handle: formatHandle(currentMethod, currentHandle),
            })
          : t("settle.addHandle")}
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
            className={`min-h-11 rounded-full border-2 border-line px-3.5 text-sm font-bold transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus ${
              method === option
                ? "bg-accent text-accent-ink shadow-hard-sm active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
                : "bg-surface text-ink-2 active:translate-y-px"
            }`}
          >
            {paymentMethodLabel(option, t("settle.methodOther"))}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <label className="sr-only" htmlFor={`handle-${participantId}`}>
          {t("settle.handleLabel", {
            method: paymentMethodLabel(method, t("settle.methodOther")),
          })}
        </label>
        <input
          id={`handle-${participantId}`}
          type="text"
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          placeholder={
            method === "paypal"
              ? t("settle.paypalPlaceholder")
              : t("settle.handlePlaceholder")
          }
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          className="min-h-11 flex-1 rounded-tile border-2 border-line bg-surface-sunk px-3 py-2 font-semibold text-ink placeholder:font-normal placeholder:text-ink-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        />
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving || handle.trim() === ""}
          className="min-h-11 rounded-full border-2 border-line bg-accent px-4 font-bold text-accent-ink shadow-hard-sm transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus active:translate-x-0.5 active:translate-y-0.5 active:shadow-none disabled:cursor-not-allowed disabled:border-ink-4 disabled:bg-surface disabled:text-ink-4 disabled:shadow-none"
        >
          {t("common.save")}
        </button>
      </div>

      {error && <p className="text-sm font-semibold text-alert-ink">{error}</p>}

      <div className="flex gap-3 text-sm">
        <button
          type="button"
          onClick={() => {
            setIsEditing(false);
            setError(null);
            setHandle(currentHandle ?? "");
          }}
          className="min-h-11 font-semibold text-ink-2 underline decoration-2 underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          {t("common.cancel")}
        </button>
        {currentHandle && (
          <button
            type="button"
            onClick={handleRemove}
            disabled={isSaving}
            className="min-h-11 font-semibold text-alert underline decoration-2 underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            {t("common.remove")}
          </button>
        )}
      </div>
    </div>
  );
}
