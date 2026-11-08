import '@tanstack/react-start/server-only'
import { db } from './db'
import { getBetterAuth } from './auth'
import { readEnv } from './env'
import { createProfileHandler } from './profile-handler'

export function handleProfileRequest(request: Request) {
  const env = readEnv()
  return createProfileHandler(db, {
    origin: env.BETTER_AUTH_URL,
    adminEmails: env.ADMIN_EMAILS,
    getSession: (headers) => getBetterAuth().api.getSession({ headers })
  })(request)
}
