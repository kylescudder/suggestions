import '@tanstack/react-start/server-only'
import { clerkClient } from '@clerk/tanstack-react-start/server'
import { readEnv } from './env'

// Comma-separated list of emails allowed into the admin dashboard.
const ADMIN_EMAILS = new Set(readEnv().ADMIN_EMAILS)

// Cache admin lookups so we don't hit the Clerk API on every request.
const adminCache = new Map<string, { isAdmin: boolean; expires: number }>()

export async function isAdmin(userId: string) {
  const cached = adminCache.get(userId)
  if (cached && cached.expires > Date.now()) return cached.isAdmin

  const user = await clerkClient().users.getUser(userId)
  const isAdmin = user.emailAddresses.some(
    (e) =>
      e.verification?.status === 'verified' &&
      ADMIN_EMAILS.has(e.emailAddress.toLowerCase())
  )
  adminCache.set(userId, { isAdmin, expires: Date.now() + 60_000 })
  return isAdmin
}
