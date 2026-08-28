import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import {
  PaymentMethod,
  formatHandle,
  paymentMethodLabel,
} from "../lib/paymentLinks";
import {
  clearPaymentPreference,
  getPaymentPreference,
  setPaymentPreference,
} from "../lib/userPreferences";
import PaymentFields from "./PaymentFields";
import { useT } from "../lib/i18n/context";

interface PaymentSetupProps {
  participantId: Id<"participants">;
  /** The current user's secret. Only they can set their own payment details. */
  secret: string;
  currentMethod: PaymentMethod | undefined;
  currentHandle: string | undefined;
  /** Owned by the parent so the "add your handle" prompt can open the editor. */
  isEditing: boolean;
  onEditingChange: (isEditing: boolean) => void;
}

/**
 * Where the person owed money says how to send it to them.
 *
 * Only ever rendered for yourself. Letting anyone edit anyone else's handle
 * would make redirecting a repayment a one-tap operation for a stranger who
 * guessed the bill code.
 *
 * Whatever is saved here is also kept on the device, so the next bill starts
 * with it already filled in.
 */
export default function PaymentSetup({
  participantId,
  secret,
  currentMethod,
  currentHandle,
  isEditing,
  onEditingChange,
}: PaymentSetupProps) {
  const t = useT();
  const setPaymentInfo = useMutation(api.participants.setPaymentInfo);

  // Falling back to the device preference matters when it could not be applied
  // automatically - an older bill, or a save that failed while offline.
  const saved = getPaymentPreference();
  const [method, setMethod] = useState<PaymentMethod>(
    currentMethod ?? saved?.method ?? "venmo",
  );
  const [handle, setHandle] = useState(currentHandle ?? saved?.handle ?? "");
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
      // Only remembered once the server has accepted it, so a rejected handle
      // is not carried forward to every future bill.
      setPaymentPreference(method, handle);
      onEditingChange(false);
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
      clearPaymentPreference();
      setHandle("");
      onEditingChange(false);
    } finally {
      setIsSaving(false);
    }
  }

  if (!isEditing) {
    const hasHandle =
      currentHandle !== undefined && currentMethod !== undefined;
    return (
      <button
        type="button"
        onClick={() => onEditingChange(true)}
        className={`inline-flex min-h-11 items-center rounded-full border-2 border-line px-4 text-sm font-bold transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus active:translate-y-px ${
          // Nothing to be paid by yet is the state worth drawing attention to,
          // so it gets the filled treatment and a set handle steps back.
          hasHandle
            ? "bg-surface text-ink-2"
            : "bg-accent text-accent-ink shadow-hard-sm active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
        }`}
      >
        {hasHandle
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
      <PaymentFields
        method={method}
        handle={handle}
        onMethodChange={setMethod}
        onHandleChange={setHandle}
        idPrefix={`settle-${participantId}`}
      >
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving || handle.trim() === ""}
          className="min-h-11 rounded-full border-2 border-line bg-accent px-4 font-bold text-accent-ink shadow-hard-sm transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus active:translate-x-0.5 active:translate-y-0.5 active:shadow-none disabled:cursor-not-allowed disabled:border-ink-4 disabled:bg-surface disabled:text-ink-4 disabled:shadow-none"
        >
          {t("common.save")}
        </button>
      </PaymentFields>

      {error && <p className="text-sm font-semibold text-alert-ink">{error}</p>}

      <div className="flex gap-3 text-sm">
        <button
          type="button"
          onClick={() => {
            onEditingChange(false);
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
