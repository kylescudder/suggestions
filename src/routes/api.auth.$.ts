import { createFileRoute } from '@tanstack/react-router'
import { readEnv } from '@/server/env'
import { getBetterAuth } from '@/server/auth'

const paths = new Set([
  '/get-session',
  '/sign-out',
  '/update-user',
  '/email-otp/send-verification-otp',
  '/sign-in/email-otp',
  '/passkey/generate-register-options',
  '/passkey/verify-registration',
  '/passkey/generate-authenticate-options',
  '/passkey/verify-authentication',
  '/passkey/list-user-passkeys',
  '/passkey/update-passkey',
  '/passkey/delete-passkey'
])

async function handler(request: Request) {
  const path = new URL(request.url).pathname.slice('/api/auth'.length)
  if (readEnv().AUTH_PROVIDER !== 'better-auth' || !paths.has(path))
    return new Response('Not found', { status: 404 })
  return getBetterAuth().handler(request)
}

export const Route = createFileRoute('/api/auth/$')({
  server: {
    handlers: {
      GET: ({ request }) => handler(request),
      POST: ({ request }) => handler(request)
    }
  }
})
