import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "convex/react";
import { useNavigate, Link } from "react-router";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import {
  getStoredParticipant,
  storeParticipant,
  clearParticipant,
  StoredCredentials,
} from "../lib/sessionStorage";
import {
  addBillToHistory,
  getBillHistory,
  updateMerchantNameInBillHistory,
  BillHistoryEntry,
} from "../lib/billHistory";
import {
  getLastUsedName,
  setLastUsedName,
  getPaymentPreference,
  setPaymentPreference,
  clearPaymentPreference,
  PaymentPreference,
} from "../lib/userPreferences";
import {
  PaymentMethod,
  formatHandle,
  isValidPaymentHandle,
  paymentMethodLabel,
} from "../lib/paymentLinks";
import PaymentFields from "../components/PaymentFields";
import { useDocumentTitle } from "../lib/useDocumentTitle";
import Mark, { Wordmark } from "../components/Mark";
import ThemeToggle from "../components/ThemeToggle";
import LanguagePicker from "../components/LanguagePicker";
import { personColorVar } from "../lib/participantColors";
import { useLocale } from "../lib/i18n/context";
import { formatMoney } from "../lib/money";

export default function Home() {
  const { t, formatDate } = useLocale();
  useDocumentTitle();

  // Unified name state (used for both create and join)
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [history, setHistory] = useState<BillHistoryEntry[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [isCheckingStored, setIsCheckingStored] = useState(false);
  const [storedCredentials, setStoredCredentials] =
    useState<StoredCredentials | null>(null);

  const navigate = useNavigate();
  const createSession = useMutation(api.sessions.create);
  const joinSessionMutation = useMutation(api.participants.join);

  // Query session by code (skip when code too short)
  const joinSession = useQuery(
    api.sessions.getByCode,
    code.length >= 6 ? { code } : "skip",
  );

  // How this device gets paid back. Set once here, and Session.tsx copies it
  // onto every bill, so nobody has to find the field inside a bill at the
  // moment everyone is trying to leave the restaurant.
  const [payment, setPayment] = useState<PaymentPreference | null>(null);
  const [isEditingPayment, setIsEditingPayment] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("venmo");
  const [paymentHandle, setPaymentHandle] = useState("");
  const [paymentError, setPaymentError] = useState<string | null>(null);

  // Pre-fill name and payment handle from localStorage on mount
  useEffect(() => {
    const savedName = getLastUsedName();
    if (savedName) {
      setName(savedName);
    }
    const savedPayment = getPaymentPreference();
    if (savedPayment) {
      setPayment(savedPayment);
      setPaymentMethod(savedPayment.method);
      setPaymentHandle(savedPayment.handle);
    }
  }, []);

  function handleSavePayment() {
    // The server applies this same rule when the handle reaches a bill. Failing
    // here means it fails in front of the person who typed it, rather than
    // silently never being applied.
    if (!isValidPaymentHandle(paymentHandle)) {
      setPaymentError(t("settle.handleRule"));
      return;
    }
    setPaymentPreference(paymentMethod, paymentHandle);
    setPayment(getPaymentPreference());
    setPaymentError(null);
    setIsEditingPayment(false);
  }

  function handleRemovePayment() {
    clearPaymentPreference();
    setPayment(null);
    setPaymentHandle("");
    setPaymentError(null);
    setIsEditingPayment(false);
  }

  // Check localStorage for stored credentials when session is found
  useEffect(() => {
    if (joinSession && code.length >= 6) {
      const stored = getStoredParticipant(code);
      if (stored) {
        setStoredCredentials(stored);
        setIsCheckingStored(true);
      } else {
        setStoredCredentials(null);
        setIsCheckingStored(false);
      }
    } else {
      setStoredCredentials(null);
      setIsCheckingStored(false);
    }
  }, [joinSession, code]);

  // Verify the stored credentials still authenticate. The server returns null
  // for anything stale or forged, which falls through to the join flow below.
  const storedParticipant = useQuery(
    api.participants.me,
    storedCredentials
      ? {
          participantId: storedCredentials.participantId as Id<"participants">,
          secret: storedCredentials.secret,
        }
      : "skip",
  );

  // Handle stored participant verification result (auto-rejoin)
  useEffect(() => {
    if (!isCheckingStored || storedParticipant === undefined) return;

    if (
      storedParticipant &&
      joinSession &&
      storedParticipant.sessionId === joinSession._id
    ) {
      // Credentials still valid for this session - auto-redirect
      navigate(`/bill/${code}/items`);
    } else {
      // Credentials rejected, or they belong to a different session
      clearParticipant(code);
      setStoredCredentials(null);
      setIsCheckingStored(false);
    }
  }, [storedParticipant, isCheckingStored, joinSession, code, navigate]);

  // Load bill history on mount
  useEffect(() => {
    setHistory(getBillHistory());
  }, []);

  // The merchant name is only written to local history on the device that
  // uploaded the receipt, so read it from the sessions themselves instead.
  const historyCodes = useMemo(
    () => history.map((bill) => bill.code),
    [history],
  );
  const historySessions = useQuery(
    api.sessions.listByCodes,
    historyCodes.length > 0 ? { codes: historyCodes } : "skip",
  );

  const merchantByCode = useMemo(() => {
    const byCode = new Map<string, string>();
    for (const session of historySessions ?? []) {
      if (session.merchant) {
        byCode.set(session.code, session.merchant);
      }
    }
    return byCode;
  }, [historySessions]);

  // Cache what we learned so the list still reads correctly offline
  useEffect(() => {
    if (!historySessions) return;

    let updated = false;
    for (const session of historySessions) {
      if (!session.merchant) continue;
      const entry = getBillHistory().find((bill) => bill.code === session.code);
      if (entry && entry.merchant !== session.merchant) {
        updateMerchantNameInBillHistory(session.code, session.merchant);
        updated = true;
      }
    }
    if (updated) {
      setHistory(getBillHistory());
    }
  }, [historySessions]);

  // Determine session state
  const isValidCode = code.length >= 6;
  const isCheckingSession = isValidCode && joinSession === undefined;
  const sessionFound = joinSession !== undefined && joinSession !== null;
  const sessionNotFound = isValidCode && joinSession === null;

  // Determine button state
  const isJoinMode = isValidCode && sessionFound && !isCheckingStored;
  const canSubmit =
    name.trim().length > 0 && !isSubmitting && !isCheckingStored;

  // Handle form submission
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || isSubmitting) return;

    setIsSubmitting(true);
    setJoinError(null);

    try {
      if (isJoinMode && joinSession) {
        // Join existing bill
        const { participantId, secret } = await joinSessionMutation({
          sessionId: joinSession._id,
          name: name.trim(),
        });
        // Store credentials for session restoration on future visits
        storeParticipant(joinSession.code, { participantId, secret });
        // Save name for future pre-fill
        setLastUsedName(name.trim());
        // Add to bill history for quick access
        addBillToHistory({
          code: joinSession.code,
          participantName: name.trim(),
          participantId,
        });
        navigate(`/bill/${joinSession.code}/items`);
      } else {
        // Create new bill
        const {
          code: newCode,
          hostParticipantId,
          hostSecret,
        } = await createSession({
          hostName: name.trim(),
        });
        // Store host credentials for session persistence (enables claiming items)
        storeParticipant(newCode, {
          participantId: hostParticipantId,
          secret: hostSecret,
        });
        // Save name for future pre-fill
        setLastUsedName(name.trim());
        // Add to bill history for quick access
        addBillToHistory({
          code: newCode,
          participantName: name.trim(),
          participantId: hostParticipantId,
        });
        navigate(`/bill/${newCode}/items`);
      }
    } catch (err) {
      // Parse Convex error messages to extract user-friendly portion
      let errorMessage = isJoinMode
        ? t("home.failedToJoin")
        : t("home.failedToCreate");
      if (err instanceof Error) {
        const match = err.message.match(/Uncaught Error:\s*(.+)$/);
        errorMessage = match ? match[1] : err.message;
      }
      setJoinError(errorMessage);
      setIsSubmitting(false);
    }
  }

  // Button text and style
  const buttonText = isSubmitting
    ? isJoinMode
      ? t("home.joining")
      : t("home.creating")
    : isCheckingSession
      ? t("common.checking")
      : isJoinMode
        ? t("home.joinBill")
        : t("home.startBill");

  const buttonDisabled =
    !canSubmit || (isValidCode && !sessionFound && !sessionNotFound);

  return (
    <div className="relative min-h-screen px-5 pt-14 pb-10">
      <div className="absolute top-5 right-5 flex items-center gap-2">
        <LanguagePicker />
        <ThemeToggle />
      </div>

      <div className="mx-auto w-full max-w-md space-y-7">
        {/* App branding */}
        <div className="flex flex-col items-center gap-3 text-center">
          <Mark size={62} />
          <h1 className="text-[42px] leading-[1.3]">
            <Wordmark />
          </h1>
          <p className="text-ink-2">{t("app.tagline")}</p>
        </div>

        {/* Unified form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name input */}
          <div className="space-y-2">
            <label
              htmlFor="name"
              className="block text-sm font-semibold text-ink-2"
            >
              {t("common.yourName")}
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("common.enterYourName")}
              autoComplete="name"
              autoCapitalize="words"
              className="w-full min-h-14 rounded-tile border-card border-line bg-surface px-4 text-lg font-semibold text-ink shadow-hard placeholder:font-normal placeholder:text-ink-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-page"
            />
          </div>

          {/* Code input (optional) */}
          <div className="space-y-2">
            <label
              htmlFor="code"
              className="block text-sm font-semibold text-ink-2"
            >
              {t("home.gotACode")}{" "}
              <span className="font-normal text-ink-3">
                {t("home.optional")}
              </span>
            </label>
            <input
              id="code"
              type="text"
              value={code}
              onChange={(e) => {
                setCode(e.target.value.toUpperCase().slice(0, 6));
                setJoinError(null);
              }}
              placeholder="ABC123"
              maxLength={6}
              autoComplete="off"
              aria-describedby="code-status"
              className={`tabular w-full min-h-14 rounded-tile bg-surface px-4 text-center text-xl font-bold uppercase tracking-[0.4em] indent-[0.4em] text-ink placeholder:text-ink-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-page ${
                sessionFound
                  ? "border-card border-line shadow-hard"
                  : "border-card border-dashed border-ink-4"
              }`}
            />
            {/* Code status message. The wrapper is always rendered so screen
                readers pick up the change rather than a node insertion. */}
            <div id="code-status" aria-live="polite" className="min-h-5">
              {isValidCode && (
                <p
                  className={`text-sm font-semibold ${
                    sessionFound
                      ? "text-ink"
                      : isCheckingSession || isCheckingStored
                        ? "text-ink-3"
                        : "text-alert"
                  }`}
                >
                  {isCheckingSession || isCheckingStored
                    ? t("common.checking")
                    : sessionFound
                      ? t("home.billFound")
                      : t("home.noBillWithCode")}
                </p>
              )}
            </div>
          </div>

          {/* How you get paid back (optional, saved on this device) */}
          <div className="space-y-2">
            <span className="block text-sm font-semibold text-ink-2">
              {t("home.gettingPaidBack")}{" "}
              <span className="font-normal text-ink-3">
                {t("home.optional")}
              </span>
            </span>

            {isEditingPayment ? (
              <>
                <PaymentFields
                  method={paymentMethod}
                  handle={paymentHandle}
                  onMethodChange={setPaymentMethod}
                  onHandleChange={(value) => {
                    setPaymentHandle(value);
                    setPaymentError(null);
                  }}
                  idPrefix="home-payment"
                  autoFocus
                >
                  <button
                    type="button"
                    onClick={handleSavePayment}
                    disabled={paymentHandle.trim() === ""}
                    className="min-h-11 rounded-full border-2 border-line bg-accent px-4 font-bold text-accent-ink shadow-hard-sm transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus active:translate-x-0.5 active:translate-y-0.5 active:shadow-none disabled:cursor-not-allowed disabled:border-ink-4 disabled:bg-surface disabled:text-ink-4 disabled:shadow-none"
                  >
                    {t("common.save")}
                  </button>
                </PaymentFields>

                {paymentError ? (
                  <p
                    role="alert"
                    className="text-sm font-semibold text-alert-ink"
                  >
                    {paymentError}
                  </p>
                ) : (
                  <p className="text-xs text-ink-3">{t("home.payHint")}</p>
                )}

                <div className="flex gap-3 text-sm">
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditingPayment(false);
                      setPaymentError(null);
                      setPaymentMethod(payment?.method ?? "venmo");
                      setPaymentHandle(payment?.handle ?? "");
                    }}
                    className="min-h-11 font-semibold text-ink-2 underline decoration-2 underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                  >
                    {t("common.cancel")}
                  </button>
                  {payment && (
                    <button
                      type="button"
                      onClick={handleRemovePayment}
                      className="min-h-11 font-semibold text-alert underline decoration-2 underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                    >
                      {t("common.remove")}
                    </button>
                  )}
                </div>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setIsEditingPayment(true)}
                className={`inline-flex min-h-11 items-center rounded-full border-2 border-line px-4 text-sm font-bold transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-page active:translate-y-px ${
                  payment
                    ? "bg-surface text-ink-2"
                    : "bg-surface text-ink shadow-hard-sm active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
                }`}
              >
                {payment
                  ? t("settle.paidViaChange", {
                      method: paymentMethodLabel(
                        payment.method,
                        t("settle.methodOther"),
                      ),
                      handle: formatHandle(payment.method, payment.handle),
                    })
                  : t("settle.addHandle")}
              </button>
            )}
          </div>

          {/* Error display */}
          {joinError && (
            <div
              role="alert"
              className="rounded-tile border-card border-alert bg-alert-tint p-3"
            >
              <p className="text-sm font-semibold text-alert-ink">
                {joinError}
              </p>
            </div>
          )}

          {/* Smart button */}
          <button
            type="submit"
            disabled={buttonDisabled}
            className="flex w-full min-h-15 items-center justify-center gap-2 rounded-card border-card border-line bg-accent font-display text-xl font-extrabold text-accent-ink shadow-hard-lg transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-page active:translate-x-1 active:translate-y-1 active:shadow-none disabled:cursor-not-allowed disabled:border-ink-4 disabled:bg-surface disabled:text-ink-4 disabled:shadow-none disabled:active:translate-x-0 disabled:active:translate-y-0"
          >
            {!isSubmitting && !isCheckingSession && (
              <svg
                aria-hidden="true"
                className="h-5 w-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.8}
                strokeLinecap="round"
              >
                <path d="M12 5v14M5 12h14" />
              </svg>
            )}
            {buttonText}
          </button>
        </form>

        {/* Bill history section */}
        {history.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-[0.18em] text-ink-3">
              {t("home.recent")}
            </h2>
            <div className="space-y-3">
              {history.map((bill, index) => (
                <Link
                  key={bill.code}
                  to={`/bill/${bill.code}/items`}
                  className="flex items-center gap-3 rounded-card border-card border-line bg-surface p-3 shadow-hard transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-page active:translate-x-1 active:translate-y-1 active:shadow-none"
                >
                  <span
                    aria-hidden="true"
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-card border-line"
                    style={{ background: personColorVar(index) }}
                  >
                    <svg
                      className="h-5 w-5"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="var(--on-person)"
                      strokeWidth={2.2}
                      strokeLinecap="round"
                    >
                      <path d="M5 12h14M7 8h10M9 16h6" />
                    </svg>
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col items-start">
                    <span className="truncate font-display text-lg font-bold text-ink">
                      {merchantByCode.get(bill.code) ||
                        bill.merchant ||
                        t("home.billNamed", { code: bill.code })}
                    </span>
                    <span className="text-xs font-medium text-ink-3">
                      {formatDate(bill.createdAt)}
                    </span>
                  </span>
                  {bill.total !== undefined && (
                    <span className="tabular font-display text-xl font-extrabold text-ink">
                      {formatMoney(bill.total)}
                    </span>
                  )}
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
