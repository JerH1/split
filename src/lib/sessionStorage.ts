/**
 * Session storage utility for localStorage-based participant persistence.
 * Allows returning users to automatically rejoin sessions without re-entering their name.
 *
 * What is stored is a *credential*, not just an identifier. The participant ID
 * is public — every client in the session receives it — so the secret issued at
 * create/join time is what actually proves the caller is that person. Both
 * halves are needed for any mutation; see convex/auth.ts.
 */

const STORAGE_KEY_PREFIX = "split_session_";

export interface StoredCredentials {
  participantId: string;
  secret: string;
}

/**
 * Get the stored credentials for a session.
 *
 * Entries written before secrets existed hold a bare participant ID string.
 * Those are treated as absent: the ID alone can no longer authorize anything,
 * so the user is sent back through the join gate to get a real credential.
 *
 * @param sessionCode - The 6-character session code
 * @returns The credentials if found and complete, null otherwise
 */
export function getStoredParticipant(
  sessionCode: string,
): StoredCredentials | null {
  try {
    const key = `${STORAGE_KEY_PREFIX}${sessionCode}`;
    const raw = localStorage.getItem(key);
    if (!raw) return null;

    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof (parsed as StoredCredentials).participantId === "string" &&
      typeof (parsed as StoredCredentials).secret === "string"
    ) {
      return parsed as StoredCredentials;
    }
    return null;
  } catch {
    // Unparseable (a pre-secret bare ID), or localStorage is unavailable in
    // private browsing. Either way there is no usable credential.
    return null;
  }
}

/**
 * Store the credentials for a session.
 * @param sessionCode - The 6-character session code
 * @param credentials - The participant ID and secret returned by create/join
 */
export function storeParticipant(
  sessionCode: string,
  credentials: StoredCredentials,
): void {
  try {
    const key = `${STORAGE_KEY_PREFIX}${sessionCode}`;
    localStorage.setItem(key, JSON.stringify(credentials));
  } catch {
    // Silently fail - session persistence is a nice-to-have, not critical
  }
}

/**
 * Clear stored credentials for a session.
 * @param sessionCode - The 6-character session code
 */
export function clearParticipant(sessionCode: string): void {
  try {
    const key = `${STORAGE_KEY_PREFIX}${sessionCode}`;
    localStorage.removeItem(key);
  } catch {
    // Silently fail
  }
}
