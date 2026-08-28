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
import { getLastUsedName, setLastUsedName } from "../lib/userPreferences";
import { useDocumentTitle } from "../lib/useDocumentTitle";
import Mark, { Wordmark } from "../components/Mark";
import ThemeToggle from "../components/ThemeToggle";
import { personColorVar } from "../lib/participantColors";

export default function Home() {
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

  // Pre-fill name from localStorage on mount
  useEffect(() => {
    const savedName = getLastUsedName();
    if (savedName) {
      setName(savedName);
    }
  }, []);

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
        ? "Failed to join bill"
        : "Failed to create bill";
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
      ? "Joining..."
      : "Creating..."
    : isCheckingSession
      ? "Checking..."
      : isJoinMode
        ? "Join Bill"
        : "Start Bill";

  const buttonDisabled =
    !canSubmit || (isValidCode && !sessionFound && !sessionNotFound);

  return (
    <div className="relative min-h-screen px-5 pt-14 pb-10">
      <ThemeToggle className="absolute top-5 right-5" />

      <div className="mx-auto w-full max-w-md space-y-7">
        {/* App branding */}
        <div className="flex flex-col items-center gap-3 text-center">
          <Mark size={62} />
          <h1 className="text-[42px] leading-[1.3]">
            <Wordmark />
          </h1>
          <p className="text-ink-2">Everyone grabs what they ate.</p>
        </div>

        {/* Unified form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name input */}
          <div className="space-y-2">
            <label
              htmlFor="name"
              className="block text-sm font-semibold text-ink-2"
            >
              Your name
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter your name"
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
              Got a code?{" "}
              <span className="font-normal text-ink-3">optional</span>
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
              className={`tabular w-full min-h-14 rounded-tile bg-surface px-4 text-center text-xl font-bold uppercase tracking-[0.4em] indent-[0.4em] text-ink placeholder:text-ink-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-page ${
                sessionFound
                  ? "border-card border-line shadow-hard"
                  : "border-card border-dashed border-ink-4"
              }`}
            />
            {/* Code status message */}
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
                  ? "Checking..."
                  : sessionFound
                    ? "Bill found!"
                    : "No bill with this code"}
              </p>
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
              Recent
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
                      stroke="#221C12"
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
                        `Bill ${bill.code}`}
                    </span>
                    <span className="text-xs font-medium text-ink-3">
                      {new Date(bill.createdAt).toLocaleDateString()}
                    </span>
                  </span>
                  {bill.total !== undefined && (
                    <span className="tabular font-display text-xl font-extrabold text-ink">
                      ${(bill.total / 100).toFixed(2)}
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
