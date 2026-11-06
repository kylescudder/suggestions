import { auth } from '@clerk/tanstack-react-start/server'
import { createFileRoute } from '@tanstack/react-router'
import { fetchRequestHandler } from '@trpc/server/adapters/fetch'
import { isAdmin } from '@/server/admin'
import { appRouter } from '@/server/trpc'
import { readEnv } from '@/server/env'
import { getBetterAuth } from '@/server/auth'
import { isVerifiedAdmin } from '@/server/auth-policy'

async function handler(request: Request) {
  const env = readEnv()
  const origin = request.headers.get('origin')
  // Admin sessions arrive as cookies, so refuse cross-site writes outright.
  if (
    request.method !== 'GET' &&
    (request.headers.get('sec-fetch-site') === 'cross-site' ||
      (env.AUTH_PROVIDER === 'better-auth' &&
        origin &&
        origin !== env.BETTER_AUTH_URL))
  )
    return Response.json(
      { error: 'Cross-site request refused' },
      { status: 403 }
    )
  return fetchRequestHandler({
    endpoint: '/api/trpc',
    req: request,
    router: appRouter,
    createContext: async () => {
      // Public submissions never need a session lookup or mail provider.
      if (new URL(request.url).pathname === '/api/trpc/suggestions.create')
        return { userId: null, isAdmin: async () => false }
      if (env.AUTH_PROVIDER === 'clerk')
        return { userId: (await auth()).userId, isAdmin }
      const session = await getBetterAuth().api.getSession({
        headers: request.headers
      })
      return {
        userId: session?.user.id ?? null,
        isAdmin: async () => isVerifiedAdmin(session?.user, env.ADMIN_EMAILS)
      }
    }
  })
}

export const Route = createFileRoute('/api/trpc/$')({
  server: {
    handlers: {
      GET: ({ request }) => handler(request),
      POST: ({ request }) => handler(request)
    }
  }
})
