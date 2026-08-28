import { PaymentMethod, paymentMethodLabel } from "../lib/paymentLinks";
import { useT } from "../lib/i18n/context";

const METHODS: PaymentMethod[] = ["venmo", "cashapp", "paypal", "other"];

interface PaymentFieldsProps {
  method: PaymentMethod;
  handle: string;
  onMethodChange: (method: PaymentMethod) => void;
  onHandleChange: (handle: string) => void;
  /** Distinguishes the label/input pair when two of these are on one page. */
  idPrefix: string;
  /** Rendered inline after the handle input - a Save button, usually. */
  children?: React.ReactNode;
  autoFocus?: boolean;
}

/**
 * The "how do I pay you" pair of controls: which app, and the name in it.
 *
 * Shared so the home screen and a bill ask for the handle in exactly the same
 * way. They differ in where the answer goes - a device preference in one case,
 * a Convex mutation in the other - which is the caller's business, not this
 * component's.
 */
export default function PaymentFields({
  method,
  handle,
  onMethodChange,
  onHandleChange,
  idPrefix,
  children,
  autoFocus,
}: PaymentFieldsProps) {
  const t = useT();

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {METHODS.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onMethodChange(option)}
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
        <label className="sr-only" htmlFor={`${idPrefix}-handle`}>
          {t("settle.handleLabel", {
            method: paymentMethodLabel(method, t("settle.methodOther")),
          })}
        </label>
        <input
          id={`${idPrefix}-handle`}
          type="text"
          value={handle}
          onChange={(e) => onHandleChange(e.target.value)}
          placeholder={
            method === "paypal"
              ? t("settle.paypalPlaceholder")
              : t("settle.handlePlaceholder")
          }
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          autoFocus={autoFocus}
          className="min-h-11 flex-1 rounded-tile border-2 border-line bg-surface-sunk px-3 py-2 font-semibold text-ink placeholder:font-normal placeholder:text-ink-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        />
        {children}
      </div>
    </div>
  );
}
