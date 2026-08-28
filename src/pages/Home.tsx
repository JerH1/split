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
    <div className="flex flex-col items-center justify-center min-h-screen p-6">
      <div className="w-full max-w-md text-center space-y-8">
        {/* App branding */}
        <div className="space-y-2">
          <h1 className="text-4xl font-bold text-gray-900">Split</h1>
          <p className="text-lg text-gray-700">
            Split bills with friends, instantly.
          </p>
        </div>

        {/* Unified form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name input */}
          <div className="space-y-2">
            <label
              htmlFor="name"
              className="block text-sm font-medium text-gray-700 text-left"
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
              className="w-full px-4 py-3 text-lg border border-gray-500 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
            />
          </div>

          {/* Code input (optional) */}
          <div className="space-y-2">
            <label
              htmlFor="code"
              className="block text-sm font-medium text-gray-700 text-left"
            >
              Bill code{" "}
              <span className="text-gray-600 font-normal">(optional)</span>
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
              className="w-full px-4 py-3 text-lg font-mono tracking-widest text-center border border-gray-500 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent uppercase"
            />
            {/* Code status message. The wrapper is always rendered so screen
                readers pick up the change rather than a node insertion. */}
            <div id="code-status" aria-live="polite" className="min-h-5">
              {isValidCode && (
                <p
                  className={`text-sm ${
                    sessionFound
                      ? "text-green-700"
                      : isCheckingSession || isCheckingStored
                        ? "text-gray-600"
                        : "text-red-700"
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
          </div>

          {/* Error display */}
          {joinError && (
            <div
              role="alert"
              className="p-3 bg-red-50 border border-red-300 rounded-lg"
            >
              <p className="text-red-700 text-sm">{joinError}</p>
            </div>
          )}

          {/* Smart button */}
          <button
            type="submit"
            disabled={buttonDisabled}
            className={`w-full py-4 text-lg font-semibold text-white rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 ${
              isJoinMode
                ? "bg-blue-700 hover:bg-blue-800 active:bg-blue-900"
                : "bg-blue-600 hover:bg-blue-700 active:bg-blue-800"
            } disabled:bg-gray-300 disabled:text-gray-700 disabled:cursor-not-allowed`}
          >
            {buttonText}
          </button>
        </form>

        {/* Bill history section */}
        {history.length > 0 && (
          <div className="mt-8 space-y-3">
            <h2 className="text-sm font-medium text-gray-600 uppercase tracking-wide">
              Recent Bills
            </h2>
            <div className="space-y-2">
              {history.map((bill) => (
                <Link
                  key={bill.code}
                  to={`/bill/${bill.code}/items`}
                  className="block p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
                >
                  <div className="flex justify-between items-center">
                    <div className="flex flex-col items-start">
                      <div className="font-medium text-gray-900">
                        {merchantByCode.get(bill.code) ||
                          bill.merchant ||
                          `Bill ${bill.code}`}
                      </div>
                      <div className="text-sm text-gray-600">
                        {new Date(bill.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                    {bill.total && (
                      <div className="text-lg font-semibold text-gray-900">
                        ${(bill.total / 100).toFixed(2)}
                      </div>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
