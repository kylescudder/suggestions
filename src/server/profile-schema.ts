import { customType, pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { authUser } from './auth-schema'

const binary = customType<{ data: Buffer }>({ dataType: () => 'bytea' })

// App-owned profile details and a small processed avatar share project backups.
export const userProfile = pgTable('user_profile', {
  userId: text('user_id')
    .primaryKey()
    .references(() => authUser.id, { onDelete: 'cascade' }),
  givenName: text('given_name').notNull().default(''),
  familyName: text('family_name').notNull().default(''),
  avatar: binary('avatar'),
  avatarVersion: text('avatar_version'),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
})
