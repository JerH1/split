// convex/locking.ts
// A locked bill is one the host has declared settled.
//
// Everything about this app is collaborative and unauthenticated, so the split
// stays editable by anyone holding the code for as long as the bill is open.
// Locking is the point where that stops: once people have paid against a set of
// numbers, a late edit silently invalidates what they already sent.

import { MutationCtx } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";

export const LOCKED_MESSAGE =
  "This bill is locked. The host can unlock it to make changes.";

/**
 * Load a session and refuse to continue if it has been locked.
 * Every mutation that changes what someone owes should call this first.
 */
export async function assertSessionOpen(
  ctx: MutationCtx,
  sessionId: Id<"sessions">,
): Promise<Doc<"sessions">> {
  const session = await ctx.db.get(sessionId);
  if (!session) {
    throw new Error("Session not found");
  }
  if (session.lockedAt !== undefined) {
    throw new Error(LOCKED_MESSAGE);
  }
  return session;
}
