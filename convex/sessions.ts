import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireHost } from "./auth";
import { randomCode, randomSecret } from "./random";
import {
  validateName,
  validateMoney,
  validateTipPercent,
  validateMerchant,
} from "./validation";

// Bill history holds at most 10 entries, so 10 is all a legitimate client ever
// needs. Every extra code per request is extra leverage for someone spraying
// guesses at the code space, so the ceiling stays tight to the real use.
const MAX_CODES_PER_LOOKUP = 10;

// Get session by share code
export const getByCode = query({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    const normalizedCode = args.code.toUpperCase().trim();
    return await ctx.db
      .query("sessions")
      .withIndex("by_code", (q) => q.eq("code", normalizedCode))
      .first();
  },
});

// Look up display info for a batch of share codes.
// Backs the "Recent Bills" list, where each device only knows the codes it
// stored locally but the merchant name lives on the session.
export const listByCodes = query({
  args: { codes: v.array(v.string()) },
  handler: async (ctx, args) => {
    if (args.codes.length > MAX_CODES_PER_LOOKUP) {
      throw new Error(`Too many codes (max ${MAX_CODES_PER_LOOKUP})`);
    }

    const normalizedCodes = [
      ...new Set(args.codes.map((code) => code.toUpperCase().trim())),
    ];

    const sessions = [];
    for (const code of normalizedCodes) {
      const session = await ctx.db
        .query("sessions")
        .withIndex("by_code", (q) => q.eq("code", code))
        .first();
      // Codes for deleted bills are simply absent from the result
      if (session) {
        sessions.push({ code: session.code, merchant: session.merchant });
      }
    }
    return sessions;
  },
});

// Get session by ID
export const get = query({
  args: { id: v.id("sessions") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

// Create a new session
export const create = mutation({
  args: { hostName: v.string() },
  handler: async (ctx, args) => {
    // Validate input
    const validatedHostName = validateName(args.hostName, "Host name");

    // Generate unique code (retry if collision)
    let code = randomCode();
    let attempts = 0;
    while (attempts < 5) {
      const existing = await ctx.db
        .query("sessions")
        .withIndex("by_code", (q) => q.eq("code", code))
        .first();
      if (!existing) break;
      code = randomCode();
      attempts++;
    }

    const sessionId = await ctx.db.insert("sessions", {
      code,
      hostName: validatedHostName,
      createdAt: Date.now(),
    });

    // Create host as first participant
    const hostSecret = randomSecret();
    const hostParticipantId = await ctx.db.insert("participants", {
      sessionId,
      name: validatedHostName,
      isHost: true,
      joinedAt: Date.now(),
      secret: hostSecret,
    });

    // hostSecret is returned exactly once, here. It is the caller's proof of
    // identity for every later mutation and never appears in a query result.
    return { sessionId, code, hostParticipantId, hostSecret };
  },
});

// Update tip settings (host only)
export const updateTip = mutation({
  args: {
    sessionId: v.id("sessions"),
    participantId: v.id("participants"),
    secret: v.string(),
    tipType: v.union(
      v.literal("percent_subtotal"),
      v.literal("percent_total"),
      v.literal("manual"),
    ),
    tipValue: v.number(),
  },
  handler: async (ctx, args) => {
    await requireHost(
      ctx,
      args.sessionId,
      args.participantId,
      args.secret,
      "modify bill settings",
    );

    // Validate tip value based on type
    let validatedTipValue: number;
    if (args.tipType === "manual") {
      validatedTipValue = validateMoney(args.tipValue, "Tip amount");
    } else {
      validatedTipValue = validateTipPercent(args.tipValue);
    }

    await ctx.db.patch(args.sessionId, {
      tipType: args.tipType,
      tipValue: validatedTipValue,
    });
  },
});

// Update tax setting (host only)
export const updateTax = mutation({
  args: {
    sessionId: v.id("sessions"),
    participantId: v.id("participants"),
    secret: v.string(),
    tax: v.number(), // in cents
  },
  handler: async (ctx, args) => {
    await requireHost(
      ctx,
      args.sessionId,
      args.participantId,
      args.secret,
      "modify bill settings",
    );

    // Validate tax amount
    const validatedTax = validateMoney(args.tax, "Tax");

    await ctx.db.patch(args.sessionId, { tax: validatedTax });
  },
});

// Update merchant (host only)
export const updateMerchant = mutation({
  args: {
    sessionId: v.id("sessions"),
    participantId: v.id("participants"),
    secret: v.string(),
    merchant: v.string(),
  },
  handler: async (ctx, args) => {
    await requireHost(
      ctx,
      args.sessionId,
      args.participantId,
      args.secret,
      "modify bill settings",
    );

    await ctx.db.patch(args.sessionId, {
      merchant: validateMerchant(args.merchant),
    });
  },
});
