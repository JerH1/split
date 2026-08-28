import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireHost, requireMember } from "./auth";
import {
  MAX_ITEMS_PER_SESSION,
  validateItemName,
  validateMoney,
  validateQuantity,
} from "./validation";
import { assertSessionOpen } from "./locking";

// List all items in a session
export const listBySession = query({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("items")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect();
  },
});

// Add an item (from OCR or manual entry) - any participant can add
export const add = mutation({
  args: {
    sessionId: v.id("sessions"),
    participantId: v.id("participants"),
    secret: v.string(),
    name: v.string(),
    price: v.number(), // In cents
    quantity: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Prove the caller is this session's participant before touching anything
    await requireMember(ctx, args.sessionId, args.participantId, args.secret);

    // Verify session exists and is still open to changes
    await assertSessionOpen(ctx, args.sessionId);

    // Any participant may add items, so the table needs a ceiling
    const existingItems = await ctx.db
      .query("items")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect();
    if (existingItems.length >= MAX_ITEMS_PER_SESSION) {
      throw new Error(`Too many items (max ${MAX_ITEMS_PER_SESSION})`);
    }

    // Validate inputs
    const validatedName = validateItemName(args.name);
    const validatedPrice = validateMoney(args.price, "Price");
    const validatedQuantity =
      args.quantity !== undefined ? validateQuantity(args.quantity) : 1;

    const itemId = await ctx.db.insert("items", {
      sessionId: args.sessionId,
      name: validatedName,
      price: validatedPrice,
      quantity: validatedQuantity,
    });
    return itemId;
  },
});

// Update an item (fix OCR errors) - any participant can edit (collaborative editing)
export const update = mutation({
  args: {
    itemId: v.id("items"),
    participantId: v.id("participants"),
    secret: v.string(),
    name: v.optional(v.string()),
    price: v.optional(v.number()),
    quantity: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Verify item exists and belongs to a valid session
    const item = await ctx.db.get(args.itemId);
    if (!item) {
      throw new Error("Item not found");
    }
    await assertSessionOpen(ctx, item.sessionId);

    // The item's own session is the authority on who may edit it
    await requireMember(ctx, item.sessionId, args.participantId, args.secret);

    // Validate and build updates
    const updates: Record<string, unknown> = {};
    if (args.name !== undefined) {
      updates.name = validateItemName(args.name);
    }
    if (args.price !== undefined) {
      updates.price = validateMoney(args.price, "Price");
    }
    if (args.quantity !== undefined) {
      updates.quantity = validateQuantity(args.quantity);
    }

    await ctx.db.patch(args.itemId, updates);
  },
});

// Delete an item (host only)
export const remove = mutation({
  args: {
    itemId: v.id("items"),
    participantId: v.id("participants"),
    secret: v.string(),
  },
  handler: async (ctx, args) => {
    // Verify item exists
    const item = await ctx.db.get(args.itemId);
    if (!item) {
      throw new Error("Item not found");
    }

    // Host of *this* item's session - hosting another bill grants nothing here
    await requireHost(
      ctx,
      item.sessionId,
      args.participantId,
      args.secret,
      "remove items",
    );
    await assertSessionOpen(ctx, item.sessionId);

    // Delete all claims for this item
    const claims = await ctx.db
      .query("claims")
      .withIndex("by_item", (q) => q.eq("itemId", args.itemId))
      .collect();

    for (const claim of claims) {
      await ctx.db.delete(claim._id);
    }

    await ctx.db.delete(args.itemId);
  },
});

// Bulk add items (from OCR) - replaces existing items for the session (host only)
export const addBulk = mutation({
  args: {
    sessionId: v.id("sessions"),
    participantId: v.id("participants"),
    secret: v.string(),
    items: v.array(
      v.object({
        name: v.string(),
        price: v.number(),
        quantity: v.optional(v.number()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    // Validate array length to prevent DoS
    if (args.items.length > MAX_ITEMS_PER_SESSION) {
      throw new Error(`Too many items (max ${MAX_ITEMS_PER_SESSION})`);
    }

    await requireHost(
      ctx,
      args.sessionId,
      args.participantId,
      args.secret,
      "replace all items",
    );
    await assertSessionOpen(ctx, args.sessionId);

    // Validate all items before making any changes
    const validatedItems = args.items.map((item) => ({
      name: validateItemName(item.name),
      price: validateMoney(item.price, "Price"),
      quantity:
        item.quantity !== undefined ? validateQuantity(item.quantity) : 1,
    }));

    // First, delete all existing items and their claims for this session
    const existingItems = await ctx.db
      .query("items")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect();

    for (const item of existingItems) {
      // Delete claims for this item
      const claims = await ctx.db
        .query("claims")
        .withIndex("by_item", (q) => q.eq("itemId", item._id))
        .collect();

      for (const claim of claims) {
        await ctx.db.delete(claim._id);
      }

      // Delete the item
      await ctx.db.delete(item._id);
    }

    // Now insert the validated items
    const itemIds = [];
    for (const item of validatedItems) {
      const itemId = await ctx.db.insert("items", {
        sessionId: args.sessionId,
        name: item.name,
        price: item.price,
        quantity: item.quantity,
      });
      itemIds.push(itemId);
    }
    return itemIds;
  },
});
