import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

const applicationTables = {
  suggestions: defineTable({
    title: v.string(),
    description: v.string(),
    status: v.string(),
    authorName: v.optional(v.string()),
    authorEmail: v.optional(v.string()),
  }).index("by_status", ["status"]),
};

export default defineSchema({
  ...authTables,
  ...applicationTables,
});
