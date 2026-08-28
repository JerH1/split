import { useState, useRef, useEffect, useMemo } from "react";
import { useParams, Link, Outlet } from "react-router";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id, Doc } from "../../convex/_generated/dataModel";
import JoinGate from "../components/JoinGate";
import JoinToast from "../components/JoinToast";
import TabNavigation from "../components/TabNavigation";
import ThemeToggle from "../components/ThemeToggle";
import LanguagePicker from "../components/LanguagePicker";
import { useT } from "../lib/i18n/context";
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
  isLocked: boolean;
  groupSubtotal: number;
  claims: Doc<"claims">[];
  currentParticipantId: Id<"participants">;
  /** The current user's own secret, required by every mutation they make. */
  secret: string;
}

export default function Session() {
  const t = useT();
  const { code } = useParams<{ code: string }>();

  // Child routes override this with their own tab name once loaded.
  useDocumentTitle(code ? t("home.billNamed", { code }) : undefined);

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
  const isLocked = session?.lockedAt !== undefined;

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
  }, [fees]);

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
        <p className="text-ink-2">{t("session.loading")}</p>
      </div>
    );
  }

  // Session not found
  if (session === null) {
    return (
      <div className="p-4 text-center">
        <h1 className="mb-2 font-display text-2xl font-extrabold leading-[1.3] text-ink">
          {t("session.notFoundTitle")}
        </h1>
        <p className="mb-4 text-ink-2">
          {t("session.notFoundBody", { code: code ?? "" })}
        </p>
        <Link
          to="/"
          className="inline-flex min-h-11 items-center rounded-tile font-bold text-ink underline decoration-2 underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          <span aria-hidden="true">←</span>&nbsp;{t("session.startANewBill")}
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
    const hostName = hostParticipant?.name ?? t("common.host");

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
      const shareUrl = `${window.location.origin}/bill/${session?.code}`;
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
      <div className="sticky top-0 z-10 flex w-full items-center gap-1 border-b-2 border-brand bg-surface px-1">
        {/* Back button */}
        {/* Icon only. With the language picker added this header carries five
            controls, and a translated word beside the chevron ("Rechnungen")
            overflowed a 375px screen - pushing the theme toggle off the edge
            and the tab bar below the fold. The chevron plus the aria-label
            carry the same meaning in every language and at a fixed width. */}
        <Link
          to="/"
          className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-tile py-3 text-ink-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus"
          aria-label={t("session.backToHome")}
        >
          <svg
            aria-hidden="true"
            xmlns="http://www.w3.org/2000/svg"
            className="h-5 w-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.8}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </Link>

        {/* Tappable Session Code */}
        <button
          type="button"
          onClick={handleCopyCode}
          aria-label={t("session.copyCodeAria", {
            digits: session.code.split("").join(" "),
          })}
          className="flex flex-1 flex-col items-center rounded-tile py-2 transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus active:translate-y-px"
        >
          <span
            aria-hidden="true"
            className="tabular font-display text-2xl font-extrabold leading-[1.3] tracking-[0.22em] indent-[0.22em] text-brand"
          >
            {session.code}
          </span>
          <span
            aria-hidden="true"
            className="text-[11px] font-semibold text-ink-3"
          >
            {copied ? t("session.copied") : t("session.tapToCopy")}
          </span>
        </button>

        {/* QR code button */}
        <Link
          to="qr"
          className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-tile text-ink-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus"
          aria-label={t("session.showQrCode")}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-5 w-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3" y="3" width="7" height="7" />
            <rect x="14" y="3" width="7" height="7" />
            <rect x="3" y="14" width="7" height="7" />
            <rect
              x="5"
              y="5"
              width="3"
              height="3"
              fill="currentColor"
              stroke="none"
            />
            <rect
              x="16"
              y="5"
              width="3"
              height="3"
              fill="currentColor"
              stroke="none"
            />
            <rect
              x="5"
              y="16"
              width="3"
              height="3"
              fill="currentColor"
              stroke="none"
            />
            <path d="M14 14h3v3h-3z" fill="currentColor" stroke="none" />
            <path d="M17 17h3v3h-3z" fill="currentColor" stroke="none" />
            <path d="M14 20h3" />
            <path d="M20 14v3" />
          </svg>
        </Link>

        <LanguagePicker
          className="shrink-0"
          buttonClassName="border-0 bg-transparent text-ink-2 shadow-none"
        />
        <ThemeToggle className="shrink-0 border-0 bg-transparent shadow-none" />
      </div>

      {/* Copy confirmation. A persistent live region, so the change is
          announced without disturbing the button's own label. */}
      <p aria-live="polite" className="sr-only">
        {copied ? t("session.linkCopied") : ""}
      </p>

      {/* Locked banner - the split is frozen, so say so before anyone tries
          to change it and gets a rejected mutation instead. */}
      {isLocked && (
        <div
          role="status"
          className="flex items-center gap-2 border-b-2 border-alert bg-alert-tint px-4 py-2 text-sm font-semibold text-alert-ink"
        >
          <svg
            aria-hidden="true"
            className="w-4 h-4 shrink-0"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
              clipRule="evenodd"
            />
          </svg>
          <span>{isHost ? t("session.lockedHost") : t("session.locked")}</span>
        </div>
      )}

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
            isLocked,
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
