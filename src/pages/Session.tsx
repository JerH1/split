import { useState, useRef, useEffect, useMemo } from "react";
import { useParams, Link, Outlet } from "react-router";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id, Doc } from "../../convex/_generated/dataModel";
import JoinGate from "../components/JoinGate";
import JoinToast from "../components/JoinToast";
import TabNavigation from "../components/TabNavigation";
import { getStoredParticipant, StoredCredentials } from "../lib/sessionStorage";
import { useDocumentTitle } from "../lib/useDocumentTitle";

/**
 * A participant as the server hands them out. Secrets are stripped server-side
 * before the roster is broadcast, so no component can read anyone else's.
 */
export type PublicParticipant = Omit<Doc<"participants">, "secret">;

export interface Context {
  fees: Doc<"fees">[];
  participants: PublicParticipant[];
  session: Doc<"sessions">;
  items: Doc<"items">[];
  isHost: boolean;
  groupSubtotal: number;
  claims: Doc<"claims">[];
  currentParticipantId: Id<"participants">;
  /** The current user's own secret, required by every mutation they make. */
  secret: string;
}

export default function Session() {
  const { code } = useParams<{ code: string }>();

  // Child routes override this with their own tab name once loaded.
  useDocumentTitle(code ? `Bill ${code}` : undefined);

  // State to track credentials after just joining (before localStorage is read again)
  const [justJoinedCredentials, setJustJoinedCredentials] =
    useState<StoredCredentials | null>(null);

  // Fetch session by code
  const session = useQuery(api.sessions.getByCode, code ? { code } : "skip");

  // Get stored credentials from sessionStorage
  const storedCredentials = useMemo(() => {
    if (!code) return null;
    return getStoredParticipant(code);
  }, [code]);

  // Use the just-joined credentials if set, otherwise the stored ones
  const credentials = justJoinedCredentials ?? storedCredentials;

  // Resolve the current participant from their credentials. The server returns
  // null unless the secret matches, so this doubles as the check that the
  // stored credential is still good.
  const currentParticipant = useQuery(
    api.participants.me,
    credentials
      ? {
          participantId: credentials.participantId as Id<"participants">,
          secret: credentials.secret,
        }
      : "skip",
  );

  // Derive current participant info (null if not joined)
  const currentParticipantId = currentParticipant?._id ?? null;
  const isHost = currentParticipant?.isHost ?? false;

  // Fetch items for this session
  const items = useQuery(
    api.items.listBySession,
    session ? { sessionId: session._id } : "skip",
  );

  // Fetch participants for this session
  const participants = useQuery(
    api.participants.listBySession,
    session ? { sessionId: session._id } : "skip",
  );

  // Fetch claims for this session
  const claims = useQuery(
    api.claims.listBySession,
    session ? { sessionId: session._id } : "skip",
  );

  // Fetch fees for this session
  const fees = useQuery(
    api.fees.listBySession,
    session ? { sessionId: session._id } : "skip",
  );

  // Compute display fees with legacy fallback
  // New sessions: use fees from fees table
  const displayFees: Doc<"fees">[] = useMemo(() => {
    // If fees table has entries, use them
    if (fees && fees.length > 0) {
      return fees;
    }
    // No fees
    return [];
  }, [fees, session?.tax]);

  // Copy code state
  const [copied, setCopied] = useState(false);

  // Track join notifications
  const [joinToasts, setJoinToasts] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const mountTimeRef = useRef(Date.now());
  const previousParticipantIdsRef = useRef<Set<string>>(new Set());

  // Calculate unclaimed count for tab badge
  const unclaimedCount = useMemo(() => {
    if (!items || !claims) return 0;
    const claimedItemIds = new Set(claims.map((c) => c.itemId));
    return items.filter((item) => !claimedItemIds.has(item._id)).length;
  }, [items, claims]);

  // Calculate group subtotal for TaxTipSettings
  const groupSubtotal = useMemo(() => {
    if (!items) return 0;
    return items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  }, [items]);

  // Detect new participants who joined after page load
  useEffect(() => {
    if (!participants) return;

    const currentIds = new Set(participants.map((p) => p._id));
    const prevIds = previousParticipantIdsRef.current;

    // Find new participants (not in previous set and joined after mount)
    const newParticipants = participants.filter(
      (p) =>
        !prevIds.has(p._id) &&
        prevIds.size > 0 && // Skip initial load
        p.joinedAt > mountTimeRef.current,
    );

    // Queue toasts for new participants
    if (newParticipants.length > 0) {
      const newToasts = newParticipants.map((p) => ({
        id: p._id,
        name: p.name,
      }));
      setJoinToasts((prev) => [...prev, ...newToasts]);
    }

    // Update ref for next comparison
    previousParticipantIdsRef.current = currentIds;
  }, [participants]);

  // Loading state
  if (session === undefined) {
    return (
      <div role="status" className="p-4">
        <p className="text-gray-600">Loading bill...</p>
      </div>
    );
  }

  // Session not found
  if (session === null) {
    return (
      <div className="p-4 text-center">
        <h1 className="text-xl font-semibold text-gray-900 mb-2">
          Bill Not Found
        </h1>
        <p className="text-gray-700 mb-4">
          Code "{code}" doesn't match any active bill. It might have expired or
          there's a typo.
        </p>
        <Link
          to="/"
          className="inline-flex min-h-[44px] items-center rounded text-blue-700 hover:text-blue-800 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
        >
          <span aria-hidden="true">←</span>&nbsp;Start a new bill
        </Link>
      </div>
    );
  }

  // Determine if user needs to join:
  // - No stored credentials means they've never joined (or hold a pre-secret entry)
  // - Credentials exist but currentParticipant is null means they were rejected
  // - currentParticipant undefined means still loading - don't show gate yet
  const needsToJoin =
    credentials === null ||
    (credentials !== null && currentParticipant === null);

  // Show join gate for non-participants
  if (needsToJoin) {
    // Find host name for display
    const hostParticipant = participants?.find((p) => p.isHost);
    const hostName = hostParticipant?.name ?? "Host";

    return (
      <JoinGate
        session={{ _id: session._id, code: session.code, hostName }}
        onJoined={(joined) => {
          setJustJoinedCredentials(joined);
        }}
      />
    );
  }

  // Handle dismissing a join toast
  function handleDismissToast(id: string) {
    setJoinToasts((prev) => prev.filter((t) => t.id !== id));
  }

  // Handle copying session code to clipboard
  async function handleCopyCode() {
    try {
      const shareUrl = `${window.location.host}/bill/${session?.code}`;
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  }

  return (
    <div>
      {/* Join notifications */}
      {joinToasts.slice(0, 1).map((toast) => (
        <JoinToast
          key={toast.id}
          name={toast.name}
          onDismiss={() => handleDismissToast(toast.id)}
        />
      ))}

      {/* Session Header */}
      <div className="sticky top-0 z-10 w-full bg-blue-50 border-b border-blue-100 flex items-center">
        {/* Back button */}
        <Link
          to="/"
          className="flex items-center gap-1 px-4 py-4 text-blue-700 hover:text-blue-800 active:text-blue-900 shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-600"
          aria-label="Back to home"
        >
          <svg
            aria-hidden="true"
            xmlns="http://www.w3.org/2000/svg"
            className="h-5 w-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M15 18l-6-6 6-6" />
          </svg>
          <span className="text-sm font-medium">Bills</span>
        </Link>

        {/* Tappable Session Code */}
        <button
          type="button"
          onClick={handleCopyCode}
          aria-label={`Bill code ${session.code.split("").join(" ")}. Copy share link.`}
          className="flex-1 py-4 text-center active:bg-blue-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-600"
        >
          <span
            aria-hidden="true"
            className="text-2xl font-mono font-bold tracking-widest text-blue-700"
          >
            {session.code}
          </span>
          <p aria-hidden="true" className="text-xs text-blue-700 mt-1">
            {copied ? "Copied!" : "tap to copy URL"}
          </p>
        </button>

        {/* Spacer to balance back button width */}
        <div className="w-[72px] shrink-0" />
      </div>

      {/* Copy confirmation. A persistent live region, so the change is
          announced without disturbing the button's own label. */}
      <p aria-live="polite" className="sr-only">
        {copied ? "Share link copied to clipboard" : ""}
      </p>

      {/* Bottom padding clears the fixed tab bar on every tab, including at
          high zoom where the bar grows. */}
      <div className="pb-20">
        <Outlet
          context={{
            participants,
            items,
            session,
            claims,
            currentParticipantId,
            isHost,
            groupSubtotal,
            fees: displayFees,
            secret: credentials?.secret ?? "",
          }}
        />
      </div>

      {/* Fixed Bottom Tab Navigation */}
      <TabNavigation unclaimedCount={unclaimedCount} />
    </div>
  );
}
