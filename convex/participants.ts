import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import {
  calculateItemShare,
  calculateTipShare,
  distributeWithRemainder,
  lineTotal,
} from "./calculations";
import { requireParticipant, toPublicParticipant } from "./auth";
import { randomSecret } from "./random";
import {
  MAX_PARTICIPANTS_PER_SESSION,
  normalizeNameForCompare,
  validateName,
  validatePaymentHandle,
} from "./validation";
import { assertSessionOpen } from "./locking";

// List all participants in a session.
// This result is broadcast to every client in the session, so it must never
// carry participant secrets - see convex/auth.ts.
export const listBySession = query({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    const participants = await ctx.db
      .query("participants")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect();
    return participants.map(toPublicParticipant);
  },
});

// Resolve the caller's own participant record from their stored credentials.
// Backs session restoration: the client holds an ID and a secret from a
// previous visit and needs to know whether they still work.
//
// Returns null rather than throwing so a stale or forged credential renders as
// "you need to join" instead of an error screen.
export const me = query({
  args: {
    participantId: v.id("participants"),
    secret: v.string(),
  },
  handler: async (ctx, args) => {
    try {
      const participant = await requireParticipant(
        ctx,
        args.participantId,
        args.secret,
      );
      return toPublicParticipant(participant);
    } catch {
      return null;
    }
  },
});

// Join a session
export const join = mutation({
  args: {
    sessionId: v.id("sessions"),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    // Verify session exists
    const session = await ctx.db.get(args.sessionId);
    if (!session) {
      throw new Error(
        "Session not found. Please check the code and try again.",
      );
    }

    // Validate and trim name
    const validatedName = validateName(args.name, "Name");

    // Check for duplicate names (case-insensitive)
    const existingParticipants = await ctx.db
      .query("participants")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect();

    // Anyone holding the code can join, so cap the roster. Otherwise a single
    // caller can inflate it until every session-scoped query is slow for the
    // people actually splitting the bill.
    if (existingParticipants.length >= MAX_PARTICIPANTS_PER_SESSION) {
      throw new Error(
        `This bill is full (max ${MAX_PARTICIPANTS_PER_SESSION} people)`,
      );
    }

    // Compare on the normalized form so a second "Alice" cannot join by
    // spelling the name with lookalike code points.
    const nameKey = normalizeNameForCompare(validatedName);
    const duplicate = existingParticipants.find(
      (p) => normalizeNameForCompare(p.name) === nameKey,
    );

    if (duplicate) {
      throw new Error(
        "That name is already taken. Please choose a different name.",
      );
    }

    const secret = randomSecret();
    const participantId = await ctx.db.insert("participants", {
      sessionId: args.sessionId,
      name: validatedName,
      isHost: false,
      joinedAt: Date.now(),
      secret,
    });
    // The secret is returned exactly once, here.
    return { participantId, secret };
  },
});

// Update participant name (requires authorization)
export const updateName = mutation({
  args: {
    participantId: v.id("participants"),
    name: v.string(),
    callerParticipantId: v.id("participants"),
    secret: v.string(),
  },
  handler: async (ctx, args) => {
    // Authenticate the caller before looking at anything else. Without this,
    // naming a caller ID was enough to become them - and every ID in the
    // session is public.
    const callerParticipant = await requireParticipant(
      ctx,
      args.callerParticipantId,
      args.secret,
    );

    // Get the target participant
    const targetParticipant = await ctx.db.get(args.participantId);
    if (!targetParticipant) {
      throw new Error("Participant not found");
    }

    // Verify caller is in the same session as target
    if (callerParticipant.sessionId !== targetParticipant.sessionId) {
      throw new Error("Not authorized to update this participant");
    }

    // Check authorization: caller is updating self OR caller is host
    const isUpdatingSelf = args.callerParticipantId === args.participantId;
    const isHost = callerParticipant.isHost === true;

    if (!isUpdatingSelf && !isHost) {
      throw new Error("Not authorized to update this participant");
    }

    // Validate and trim name
    const validatedName = validateName(args.name, "Name");

    // Check for duplicate names (normalized, so lookalike spellings collide)
    const existingParticipants = await ctx.db
      .query("participants")
      .withIndex("by_session", (q) =>
        q.eq("sessionId", targetParticipant.sessionId),
      )
      .collect();

    const nameKey = normalizeNameForCompare(validatedName);
    const duplicate = existingParticipants.find(
      (p) =>
        normalizeNameForCompare(p.name) === nameKey &&
        p._id !== args.participantId,
    );

    if (duplicate) {
      throw new Error("That name is already taken");
    }

    await ctx.db.patch(args.participantId, {
      name: validatedName,
    });
  },
});

// Get per-participant breakdown with real-time updates
export const getTotals = query({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    // 1. Fetch all data
    const session = await ctx.db.get(args.sessionId);
    if (!session) {
      throw new Error("Session not found");
    }

    const participants = await ctx.db
      .query("participants")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect();

    const items = await ctx.db
      .query("items")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect();

    const claims = await ctx.db
      .query("claims")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect();

    // 2. Build claim map: itemId -> array of participantIds
    const claimsByItem = new Map<Id<"items">, Id<"participants">[]>();
    for (const claim of claims) {
      const existing = claimsByItem.get(claim.itemId) || [];
      existing.push(claim.participantId);
      claimsByItem.set(claim.itemId, existing);
    }

    // 3. Calculate participant subtotals and track claimed items
    type ClaimedItem = {
      itemId: Id<"items">;
      itemName: string;
      sharePrice: number;
      claimCount: number;
    };

    const participantData = new Map<
      Id<"participants">,
      { subtotal: number; claimedItems: ClaimedItem[] }
    >();

    // Initialize all participants
    for (const participant of participants) {
      participantData.set(participant._id, { subtotal: 0, claimedItems: [] });
    }

    // Track unclaimed items
    const unclaimedItems: {
      itemId: Id<"items">;
      itemName: string;
      price: number;
    }[] = [];
    let groupSubtotal = 0;

    // Process each item
    for (const item of items) {
      const claimants = claimsByItem.get(item._id) || [];

      if (claimants.length === 0) {
        // Unclaimed item
        unclaimedItems.push({
          itemId: item._id,
          itemName: item.name,
          price: lineTotal(item),
        });
        continue;
      }

      // Calculate shares for this item
      const shares = calculateItemShare(lineTotal(item), claimants.length);

      // Add to each claimant's totals
      for (let i = 0; i < claimants.length; i++) {
        const participantId = claimants[i];
        const sharePrice = shares[i];
        const data = participantData.get(participantId);

        if (data) {
          data.subtotal += sharePrice;
          data.claimedItems.push({
            itemId: item._id,
            itemName: item.name,
            sharePrice,
            claimCount: claimants.length,
          });
        }
      }

      groupSubtotal += lineTotal(item);
    }

    // 4. Get fees from fees table (or fall back to legacy session.tax)
    const feesFromTable = await ctx.db
      .query("fees")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect();

    // Dual-read fallback: use fees table if present, otherwise legacy tax field
    let fees: { label: string; amount: number }[];
    let totalFees: number;
    if (feesFromTable.length > 0) {
      // Use fees from table
      fees = feesFromTable.map((f) => ({ label: f.label, amount: f.amount }));
      totalFees = fees.reduce((sum, fee) => sum + fee.amount, 0);
    } else if (session.tax) {
      // Fall back to legacy tax field (existing sessions)
      fees = [{ label: "Tax", amount: session.tax }];
      totalFees = session.tax;
    } else {
      // No fees
      fees = [];
      totalFees = 0;
    }

    const tipType = session.tipType ?? "percent_subtotal";
    const tipValue = session.tipValue ?? 0;

    // 5. Calculate fees for each participant and distribute remainder
    // Use TOTAL bill subtotal (all items) as denominator, not just claimed items
    // This ensures fees are proportional to participant's share of the ENTIRE bill
    const participantSubtotals = participants.map(
      (p) => participantData.get(p._id)?.subtotal ?? 0,
    );

    // Calculate total bill subtotal (all items, claimed or not)
    const billSubtotal = items.reduce((sum, item) => sum + lineTotal(item), 0);
    const claimedSubtotal = participantSubtotals.reduce((sum, s) => sum + s, 0);
    const unclaimedSubtotal = billSubtotal - claimedSubtotal;

    // Include unclaimed portion in distribution to get correct proportions
    // The unclaimed portion's share will be discarded (not assigned to anyone)
    const allSubtotals = [...participantSubtotals, unclaimedSubtotal];

    // Distribute each fee proportionally, accumulate per-participant totals
    const feeShares = participants.map(() => 0);
    for (const fee of fees) {
      const allFeeShares = distributeWithRemainder(fee.amount, allSubtotals);
      const participantFeeShares = allFeeShares.slice(0, -1); // Remove unclaimed portion
      for (let i = 0; i < participants.length; i++) {
        feeShares[i] += participantFeeShares[i];
      }
    }

    // 6. Calculate tip based on type
    // For percent types, calculate individually; for manual, distribute with remainder
    let tipShares: number[];
    if (tipType === "manual") {
      const allTipShares = distributeWithRemainder(tipValue, allSubtotals);
      tipShares = allTipShares.slice(0, -1);
    } else {
      tipShares = participants.map((p, i) => {
        const data = participantData.get(p._id);
        if (!data) return 0;
        return calculateTipShare(
          data.subtotal,
          feeShares[i],
          groupSubtotal,
          totalFees,
          tipType,
          tipValue,
        );
      });
    }

    // 7. Build results sorted by joinedAt (host first)
    const sortedParticipants = [...participants].sort(
      (a, b) => a.joinedAt - b.joinedAt,
    );

    const results = sortedParticipants.map((participant) => {
      const originalIndex = participants.findIndex(
        (p) => p._id === participant._id,
      );
      const data = participantData.get(participant._id) || {
        subtotal: 0,
        claimedItems: [],
      };
      const tax = feeShares[originalIndex]; // Keep "tax" field name for backward compat
      const tip = tipShares[originalIndex];

      return {
        participantId: participant._id,
        name: participant.name,
        isHost: participant.isHost,
        subtotal: data.subtotal,
        tax, // Renamed semantically to "fees" share, but keep field name for UI compat
        tip,
        total: data.subtotal + tax + tip, // subtotal + fees + tip
        claimedItems: data.claimedItems,
        paymentMethod: participant.paymentMethod,
        paymentHandle: participant.paymentHandle,
        isReady: participant.isReady === true,
        paidAt: participant.paidAt,
      };
    });

    const unclaimedTotal = unclaimedItems.reduce(
      (sum, item) => sum + item.price,
      0,
    );

    return {
      participants: results,
      unclaimedTotal,
      unclaimedItems,
      groupSubtotal,
      totalTax: totalFees, // Keep "totalTax" field name for backward compat
      tipType,
      tipValue,
      fees, // NEW: Array of fees for UI display
    };
  },
});

// Set how this person wants to be paid back.
//
// Self-service only, and proven with the caller's own secret. A participant ID
// is public, so without the secret anyone reading the roster could point
// someone else's repayment at their own handle.
export const setPaymentInfo = mutation({
  args: {
    participantId: v.id("participants"),
    secret: v.string(),
    paymentMethod: v.optional(
      v.union(
        v.literal("venmo"),
        v.literal("cashapp"),
        v.literal("paypal"),
        v.literal("other"),
      ),
    ),
    paymentHandle: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireParticipant(ctx, args.participantId, args.secret);

    // Clearing one field clears both: a handle with no method has nowhere to
    // link to, and a method with no handle names no one.
    const hasHandle =
      args.paymentHandle !== undefined && args.paymentHandle.trim() !== "";
    if (!hasHandle || args.paymentMethod === undefined) {
      await ctx.db.patch(args.participantId, {
        paymentMethod: undefined,
        paymentHandle: undefined,
      });
      return;
    }

    await ctx.db.patch(args.participantId, {
      paymentMethod: args.paymentMethod,
      paymentHandle: validatePaymentHandle(args.paymentHandle!),
    });
  },
});

// Mark yourself done claiming (or change your mind).
//
// Purely advisory - it does not freeze anything. It exists so the host can tell
// the difference between "nobody claimed the fries" and "someone is still
// scrolling", which the unclaimed-item count alone cannot express.
export const setReady = mutation({
  args: {
    participantId: v.id("participants"),
    secret: v.string(),
    isReady: v.boolean(),
  },
  handler: async (ctx, args) => {
    const participant = await requireParticipant(
      ctx,
      args.participantId,
      args.secret,
    );
    await assertSessionOpen(ctx, participant.sessionId);

    await ctx.db.patch(args.participantId, { isReady: args.isReady });
  },
});

// Mark a share as settled.
//
// Allowed while the bill is locked: locking is what happens when a bill is
// ready to be paid, so settlement has to keep working afterwards.
export const setPaid = mutation({
  args: {
    participantId: v.id("participants"),
    callerParticipantId: v.id("participants"),
    secret: v.string(),
    paid: v.boolean(),
  },
  handler: async (ctx, args) => {
    const target = await ctx.db.get(args.participantId);
    if (!target) {
      throw new Error("Participant not found");
    }

    const caller = await requireParticipant(
      ctx,
      args.callerParticipantId,
      args.secret,
    );
    if (caller.sessionId !== target.sessionId) {
      throw new Error("Not authorized to update this participant");
    }

    // You can settle your own share; the host confirms everyone else's.
    const isSelf = args.callerParticipantId === args.participantId;
    if (!isSelf && caller.isHost !== true) {
      throw new Error("Not authorized to update this participant");
    }

    await ctx.db.patch(args.participantId, {
      paidAt: args.paid ? Date.now() : undefined,
    });
  },
});
