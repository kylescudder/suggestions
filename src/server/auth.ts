import '@tanstack/react-start/server-only'
import { db } from './db'
import { readEnv } from './env'
import { createSuggestionsAuth } from './auth-factory'
import { sendLinkEmail, sendLoginEmail } from './auth-email'

let instance: ReturnType<typeof createSuggestionsAuth> | undefined

export function getBetterAuth() {
  if (instance) return instance
  const env = readEnv()
  if (env.AUTH_PROVIDER !== 'better-auth')
    throw new Error('Better Auth is not enabled')
  instance = createSuggestionsAuth(
    db,
    {
      baseURL: env.BETTER_AUTH_URL!,
      secret: env.BETTER_AUTH_SECRET!,
      adminEmails: env.ADMIN_EMAILS,
      dailyEmailLimit: env.AUTH_EMAIL_DAILY_LIMIT
    },
    (email, otp) =>
      sendLoginEmail(
        { apiKey: env.BREVO_API_KEY!, from: env.AUTH_EMAIL_FROM! },
        email,
        otp
      ),
    (email, kind, url) =>
      sendLinkEmail(
        { apiKey: env.BREVO_API_KEY!, from: env.AUTH_EMAIL_FROM! },
        new URL(env.BETTER_AUTH_URL!).origin,
        email,
        kind,
        url
      )
  )
  return instance
}
