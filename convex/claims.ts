import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireHost, requireParticipant, requireMember } from "./auth";
import { assertSessionOpen } from "./locking";

// List all claims in a session (with item and participant details)
export const listBySession = query({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("claims")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect();
  },
});

// Claim an item
export const claim = mutation({
  args: {
    sessionId: v.id("sessions"),
    itemId: v.id("items"),
    participantId: v.id("participants"),
    secret: v.string(),
  },
  handler: async (ctx, args) => {
    // Prove the caller is who they say, and that they are in this session
    await requireMember(ctx, args.sessionId, args.participantId, args.secret);

    // The item has to be part of the same bill. Without this check a caller
    // could file a claim row pointing at an item in someone else's session,
    // corrupting that bill's totals from outside it.
    const item = await ctx.db.get(args.itemId);
    if (!item || item.sessionId !== args.sessionId) {
      throw new Error("Item not found in this bill");
    }
    await assertSessionOpen(ctx, args.sessionId);

    // Check if already claimed by this participant
    const existing = await ctx.db
      .query("claims")
      .withIndex("by_item", (q) => q.eq("itemId", args.itemId))
      .filter((q) => q.eq(q.field("participantId"), args.participantId))
      .first();

    if (existing) {
      return existing._id; // Already claimed, idempotent
    }

    return await ctx.db.insert("claims", {
      sessionId: args.sessionId,
      itemId: args.itemId,
      participantId: args.participantId,
    });
  },
});

// Unclaim an item (requires authorization)
export const unclaim = mutation({
  args: {
    itemId: v.id("items"),
    participantId: v.id("participants"),
    callerParticipantId: v.id("participants"),
    secret: v.string(),
  },
  handler: async (ctx, args) => {
    // Authenticate the caller. Passing someone else's public ID used to be
    // enough to act as them.
    const callerParticipant = await requireParticipant(
      ctx,
      args.callerParticipantId,
      args.secret,
    );

    const item = await ctx.db.get(args.itemId);
    if (!item) {
      throw new Error("Item not found");
    }

    // Scope the caller to the item's own bill. isHost is not a global role:
    // hosting one bill must not let you edit claims in another.
    if (callerParticipant.sessionId !== item.sessionId) {
      throw new Error("Not authorized to unclaim for this participant");
    }

    // Check authorization: caller is unclaiming self OR caller is host
    const isUnclaimingSelf = args.callerParticipantId === args.participantId;
    const isHost = callerParticipant.isHost === true;

    if (!isUnclaimingSelf && !isHost) {
      throw new Error("Not authorized to unclaim for this participant");
    }
    await assertSessionOpen(ctx, callerParticipant.sessionId);

    const claim = await ctx.db
      .query("claims")
      .withIndex("by_item", (q) => q.eq("itemId", args.itemId))
      .filter((q) => q.eq(q.field("participantId"), args.participantId))
      .first();

    if (claim) {
      await ctx.db.delete(claim._id);
    }
  },
});

// Unclaim an item as host (can remove anyone's claim)
export const unclaimByHost = mutation({
  args: {
    itemId: v.id("items"),
    participantId: v.id("participants"),
    hostParticipantId: v.id("participants"),
    secret: v.string(),
  },
  handler: async (ctx, args) => {
    // Verify item exists first so the host check can be scoped to its session
    const item = await ctx.db.get(args.itemId);
    if (!item) {
      throw new Error("Item not found");
    }

    await requireHost(
      ctx,
      item.sessionId,
      args.hostParticipantId,
      args.secret,
      "unclaim for others",
    );
    await assertSessionOpen(ctx, item.sessionId);

    // Find and delete the claim
    const claim = await ctx.db
      .query("claims")
      .withIndex("by_item", (q) => q.eq("itemId", args.itemId))
      .filter((q) => q.eq(q.field("participantId"), args.participantId))
      .first();

    if (claim) {
      await ctx.db.delete(claim._id);
    }
  },
});

// Claim one item on behalf of everyone in the session.
//
// The shared-appetizer case. Without this, splitting a bottle of wine five ways
// means five people each hunting down the same row, and the split is silently
// wrong until the last one gets there.
export const claimForEveryone = mutation({
  args: {
    sessionId: v.id("sessions"),
    itemId: v.id("items"),
    participantId: v.id("participants"),
    secret: v.string(),
  },
  handler: async (ctx, args) => {
    await requireMember(ctx, args.sessionId, args.participantId, args.secret);
    await assertSessionOpen(ctx, args.sessionId);

    const item = await ctx.db.get(args.itemId);
    if (!item || item.sessionId !== args.sessionId) {
      throw new Error("Item not found in this session");
    }

    const participants = await ctx.db
      .query("participants")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect();

    const existingClaims = await ctx.db
      .query("claims")
      .withIndex("by_item", (q) => q.eq("itemId", args.itemId))
      .collect();
    const alreadyClaimed = new Set(
      existingClaims.map((claim) => claim.participantId),
    );

    for (const person of participants) {
      if (alreadyClaimed.has(person._id)) continue;
      await ctx.db.insert("claims", {
        sessionId: args.sessionId,
        itemId: args.itemId,
        participantId: person._id,
      });
    }
  },
});

// Drop every claim on an item, whoever made them.
//
// The undo for claimForEveryone. Removing five claims one at a time would mean
// five round trips and an item that is briefly split four ways at each step.
export const unclaimEveryone = mutation({
  args: {
    itemId: v.id("items"),
    participantId: v.id("participants"),
    secret: v.string(),
  },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.itemId);
    if (!item) {
      throw new Error("Item not found");
    }

    await requireMember(ctx, item.sessionId, args.participantId, args.secret);
    await assertSessionOpen(ctx, item.sessionId);

    const claims = await ctx.db
      .query("claims")
      .withIndex("by_item", (q) => q.eq("itemId", args.itemId))
      .collect();

    for (const claim of claims) {
      await ctx.db.delete(claim._id);
    }
  },
});
