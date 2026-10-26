import { auth } from '@clerk/tanstack-react-start/server'
import { createFileRoute } from '@tanstack/react-router'
import { fetchRequestHandler } from '@trpc/server/adapters/fetch'
import { isAdmin } from '@/server/admin'
import { appRouter } from '@/server/trpc'

async function handler(request: Request) {
  // Admin sessions arrive as cookies, so refuse cross-site writes outright.
  if (
    request.method !== 'GET' &&
    request.headers.get('sec-fetch-site') === 'cross-site'
  )
    return Response.json(
      { error: 'Cross-site request refused' },
      { status: 403 }
    )
  return fetchRequestHandler({
    endpoint: '/api/trpc',
    req: request,
    router: appRouter,
    createContext: async () => ({ userId: (await auth()).userId, isAdmin })
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
