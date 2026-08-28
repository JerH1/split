import { useState, useEffect } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { getLastUsedName, setLastUsedName } from "../lib/userPreferences";
import { storeParticipant, StoredCredentials } from "../lib/sessionStorage";
import { addBillToHistory } from "../lib/billHistory";
import { useDocumentTitle } from "../lib/useDocumentTitle";

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
    <div className="max-w-md mx-auto">
      {/* Session Code Header */}
      <div className="p-4 bg-blue-50 border-b border-blue-100 text-center">
        <span className="text-2xl font-mono font-bold tracking-widest text-blue-600">
          {session.code}
        </span>
        <p className="text-sm text-gray-700 mt-1">
          Hosted by {session.hostName}
        </p>
      </div>

      {/* Join Form */}
      <div className="p-6 space-y-6">
        <div className="text-center">
          <h1 className="text-xl font-semibold text-gray-900 mb-2">
            Join this bill
          </h1>
          <p className="text-gray-700">
            Enter your name to see items and claim your share.
          </p>
        </div>

        <form onSubmit={handleJoin} className="space-y-4">
          {/* Name input */}
          <div className="space-y-2">
            <label
              htmlFor="join-name"
              className="block text-sm font-medium text-gray-700"
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
              className="w-full px-4 py-3 text-lg border border-gray-500 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
            />
          </div>

          {/* Error display */}
          {error && (
            <div
              role="alert"
              className="p-3 bg-red-50 border border-red-300 rounded-lg"
            >
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          )}

          {/* Join button */}
          <button
            type="submit"
            disabled={!name.trim() || isJoining}
            className="w-full py-4 text-lg font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 active:bg-blue-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 disabled:bg-gray-300 disabled:text-gray-700 disabled:cursor-not-allowed"
          >
            {isJoining ? "Joining..." : "Join Bill"}
          </button>
        </form>
      </div>
    </div>
  );
}
