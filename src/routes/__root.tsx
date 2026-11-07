import { ClerkProvider } from '@clerk/tanstack-react-start'
import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRoute
} from '@tanstack/react-router'
import type { ReactNode } from 'react'
import styles from '@/styles.css?url'
import { getAuthConfig } from '@/lib/auth-config'
import { Toaster } from '@/components/ui/sonner'

export const Route = createRootRoute({
  loader: () => getAuthConfig(),
  head: () => ({
    meta: [
      { charSet: 'UTF-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1.0' },
      { name: 'theme-color', content: '#312e81' },
      { title: 'Suggestions' },
      { property: 'og:image', content: '/og-preview.png' }
    ],
    links: [
      { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
      { rel: 'stylesheet', href: styles }
    ]
  }),
  component: RootComponent,
  shellComponent: RootDocument
})

function RootComponent() {
  const { provider } = Route.useLoaderData()
  if (provider === 'better-auth')
    return (
      <>
        <Outlet />
        <Toaster />
      </>
    )
  return (
    <ClerkProvider>
      <Outlet />
      <Toaster />
    </ClerkProvider>
  )
}

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang='en'>
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}
