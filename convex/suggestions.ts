import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("suggestions")
      .withIndex("by_status")
      .order("desc")
      .collect();
  },
});

export const listByStatus = query({
  args: { status: v.optional(v.string()) },
  handler: async (ctx, args) => {
    if (!args.status) {
      return await ctx.db.query("suggestions").order("desc").collect();
    }

    return await ctx.db
      .query("suggestions")
      .withIndex("by_status", (q) => q.eq("status", args.status!))
      .order("desc")
      .collect();
  },
});

export const create = mutation({
  args: {
    title: v.string(),
    description: v.string(),
    authorName: v.optional(v.string()),
    authorEmail: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    let user = null;

    if (userId) {
      user = await ctx.db.get(userId);
    }

    return await ctx.db.insert("suggestions", {
      title: args.title,
      description: args.description,
      status: "pending",
      authorName: args.authorName || user?.name || user?.email || undefined,
      authorEmail: args.authorEmail || user?.email || undefined,
    });
  },
});

export const updateStatus = mutation({
  args: {
    suggestionId: v.id("suggestions"),
    status: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Must be logged in as admin");
    }

    return await ctx.db.patch(args.suggestionId, {
      status: args.status,
    });
  },
});

export const getStats = query({
  args: {},
  handler: async (ctx) => {
    const suggestions = await ctx.db.query("suggestions").collect();

    return {
      all: suggestions.length,
      pending: suggestions.filter((s) => s.status === "pending").length,
      reviewed: suggestions.filter((s) => s.status === "reviewed").length,
      implemented: suggestions.filter((s) => s.status === "implemented").length,
      rejected: suggestions.filter((s) => s.status === "rejected").length,
    };
  },
});
