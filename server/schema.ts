import {
  doublePrecision,
  index,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex
} from 'drizzle-orm/pg-core'

export const suggestions = pgTable(
  'suggestions',
  {
    id: serial('id').primaryKey(),
    title: text('title').notNull(),
    description: text('description').notNull(),
    status: text('status').notNull().default('pending'),
    authorName: text('author_name'),
    authorEmail: text('author_email'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    // Preserve source IDs from the Convex import.
    legacyConvexId: text('legacy_convex_id'),
    legacyConvexCreatedAt: doublePrecision('legacy_convex_created_at')
  },
  (table) => [
    index('suggestions_status_idx').on(table.status),
    uniqueIndex('suggestions_legacy_convex_id_idx').on(table.legacyConvexId)
  ]
)
