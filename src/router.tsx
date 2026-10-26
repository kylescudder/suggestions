import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createRouter } from '@tanstack/react-router'
import { createTRPCClient, httpBatchLink } from '@trpc/client'
import type { AppRouter } from '@/server/trpc'
import { TRPCProvider } from '@/lib/trpc'
import { routeTree } from './routeTree.gen'

export function getRouter() {
  const queryClient = new QueryClient()
  const trpcClient = createTRPCClient<AppRouter>({
    links: [httpBatchLink({ url: '/api/trpc' })]
  })

  return createRouter({
    routeTree,
    defaultPreload: 'intent',
    scrollRestoration: true,
    Wrap: ({ children }) => (
      <QueryClientProvider client={queryClient}>
        <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
          {children}
        </TRPCProvider>
      </QueryClientProvider>
    )
  })
}
