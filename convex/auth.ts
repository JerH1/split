// convex/auth.ts
// Participant authentication for an app with no user accounts.
//
// The security model has two layers:
//
//   1. The 6-character session code gates *discovery*. You cannot reach a bill
//      you were not given the code for.
//   2. A per-participant secret gates *identity*. Knowing the code lets you
//      join as a new person; it does not let you act as an existing one.
//
// Layer 2 exists because participant IDs are necessarily public: the roster,
// the claim list, and the summary all ship them to every client so the UI can
// attribute items to people. An ID is therefore a name, not a password. Every
// mutation that acts on someone's behalf must present that person's secret.

import { Doc, Id } from "./_generated/dataModel";
import { DatabaseReader } from "./_generated/server";

// MutationCtx.db (DatabaseWriter) is assignable to this, so the same helpers
// serve queries and mutations.
type ReadCtx = { db: DatabaseReader };

// One message for every identity failure. Distinguishing "no such participant"
// from "wrong secret" would turn these mutations into an oracle for probing
// which IDs exist.
const NOT_AUTHORIZED = "Not authorized for this bill";

/**
 * Compare two secrets without leaking, through timing, how many leading
 * characters a guess got right.
 *
 * Length is compared up front and therefore leaks, which is fine: every secret
 * this app issues is the same length.
 */
export function secretsMatch(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Resolve a caller to their participant record, or throw.
 *
 * Participants created before secrets existed have none, and there is no secret
 * anyone could present for them. They fail closed: those bills become
 * read-only rather than remaining forgeable.
 */
export async function requireParticipant(
  ctx: ReadCtx,
  participantId: Id<"participants">,
  secret: string,
): Promise<Doc<"participants">> {
  const participant = await ctx.db.get(participantId);
  if (!participant || !participant.secret) {
    throw new Error(NOT_AUTHORIZED);
  }
  if (!secretsMatch(participant.secret, secret)) {
    throw new Error(NOT_AUTHORIZED);
  }
  return participant;
}

/**
 * Resolve a caller and confirm they belong to the session being acted on.
 *
 * Without the session check, a valid participant of *any* bill could pass their
 * own credentials while naming a stranger's sessionId.
 */
export async function requireMember(
  ctx: ReadCtx,
  sessionId: Id<"sessions">,
  participantId: Id<"participants">,
  secret: string,
): Promise<Doc<"participants">> {
  const participant = await requireParticipant(ctx, participantId, secret);
  if (participant.sessionId !== sessionId) {
    throw new Error(NOT_AUTHORIZED);
  }
  return participant;
}

/**
 * Resolve a caller and confirm they host the session being acted on.
 *
 * `isHost` is only meaningful together with the session check: hosting one bill
 * must not confer host powers over another.
 */
export async function requireHost(
  ctx: ReadCtx,
  sessionId: Id<"sessions">,
  participantId: Id<"participants">,
  secret: string,
  action: string = "modify this bill",
): Promise<Doc<"participants">> {
  const participant = await requireMember(
    ctx,
    sessionId,
    participantId,
    secret,
  );
  if (!participant.isHost) {
    throw new Error(`Only the host can ${action}`);
  }
  return participant;
}

/** A participant as the rest of the world is allowed to see them. */
export type PublicParticipant = Omit<Doc<"participants">, "secret">;

/**
 * Strip the secret before a participant record leaves the server. Queries are
 * broadcast to every client in the session, so this is the difference between
 * a credential and a public handle.
 */
export function toPublicParticipant(
  participant: Doc<"participants">,
): PublicParticipant {
  const { secret: _secret, ...rest } = participant;
  return rest;
}
