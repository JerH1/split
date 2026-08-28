import { useState, useEffect } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { getLastUsedName, setLastUsedName } from "../lib/userPreferences";
import { storeParticipant, StoredCredentials } from "../lib/sessionStorage";
import { addBillToHistory } from "../lib/billHistory";
import { useDocumentTitle } from "../lib/useDocumentTitle";
import Mark, { Wordmark } from "./Mark";
import ThemeToggle from "./ThemeToggle";

interface JoinGateProps {
  session: { _id: Id<"sessions">; code: string; hostName: string };
  onJoined: (credentials: StoredCredentials) => void;
}

export default function JoinGate({ session, onJoined }: JoinGateProps) {
  useDocumentTitle(`Join bill ${session.code}`);

  const [name, setName] = useState("");
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const joinSession = useMutation(api.participants.join);

  // Pre-fill name from localStorage on mount
  useEffect(() => {
    const savedName = getLastUsedName();
    if (savedName) {
      setName(savedName);
    }
  }, []);

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || isJoining) return;

    setIsJoining(true);
    setError(null);

    try {
      const { participantId, secret } = await joinSession({
        sessionId: session._id,
        name: name.trim(),
      });

      // Store credentials for session restoration on future visits
      storeParticipant(session.code, { participantId, secret });

      // Save name for future pre-fill
      setLastUsedName(name.trim());

      // Add to bill history for quick access
      addBillToHistory({
        code: session.code,
        participantName: name.trim(),
        participantId,
      });

      // Notify parent to show bill content
      onJoined({ participantId, secret });
    } catch (err) {
      // Parse Convex error messages to extract user-friendly portion
      let errorMessage = "Failed to join bill";
      if (err instanceof Error) {
        const match = err.message.match(/Uncaught Error:\s*(.+)$/);
        errorMessage = match ? match[1] : err.message;
      }
      setError(errorMessage);
      setIsJoining(false);
    }
  }

  return (
    <div className="relative mx-auto max-w-md">
      <ThemeToggle className="absolute top-4 right-4" />

      {/* Session Code Header */}
      <div className="flex flex-col items-center gap-2 border-b-2 border-brand bg-surface px-6 pb-4 pt-12">
        <Mark size={46} />
        <span className="tabular font-display text-2xl font-extrabold leading-[1.3] tracking-[0.22em] indent-[0.22em] text-brand">
          {session.code}
        </span>
        <p className="text-sm text-ink-2">Hosted by {session.hostName}</p>
      </div>

      {/* Join Form */}
      <div className="space-y-6 p-6">
        <div className="text-center">
          <h1 className="font-display text-2xl font-extrabold leading-[1.3] text-ink">
            Join this bill
          </h1>
          <p className="mt-1 text-ink-2">
            Enter your name to see items and claim your share.
          </p>
        </div>

        <form onSubmit={handleJoin} className="space-y-4">
          {/* Name input */}
          <div className="space-y-2">
            <label
              htmlFor="join-name"
              className="block text-sm font-semibold text-ink-2"
            >
              Your name
            </label>
            <input
              id="join-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter your name"
              autoComplete="name"
              autoCapitalize="words"
              autoFocus
              className="w-full min-h-14 rounded-tile border-card border-line bg-surface px-4 text-lg font-semibold text-ink shadow-hard placeholder:font-normal placeholder:text-ink-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-page"
            />
          </div>

          {/* Error display */}
          {error && (
            <div
              role="alert"
              className="rounded-tile border-card border-alert bg-alert-tint p-3"
            >
              <p className="text-sm font-semibold text-alert-ink">{error}</p>
            </div>
          )}

          {/* Join button */}
          <button
            type="submit"
            disabled={!name.trim() || isJoining}
            className="w-full min-h-15 rounded-card border-card border-line bg-accent font-display text-xl font-extrabold text-accent-ink shadow-hard-lg transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-page active:translate-x-1 active:translate-y-1 active:shadow-none disabled:cursor-not-allowed disabled:border-ink-4 disabled:bg-surface disabled:text-ink-4 disabled:shadow-none disabled:active:translate-x-0 disabled:active:translate-y-0"
          >
            {isJoining ? "Joining..." : "Join Bill"}
          </button>
        </form>

        <p className="text-center text-xs font-semibold uppercase tracking-[0.14em] text-ink-4">
          <Wordmark /> · no sign-up needed
        </p>
      </div>
    </div>
  );
}
