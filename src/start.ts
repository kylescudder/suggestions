import { clerkMiddleware } from '@clerk/tanstack-react-start/server'
import { createStart } from '@tanstack/react-start'

export const startInstance = createStart(() => ({
  requestMiddleware: [
    clerkMiddleware(() => ({
      // Comma-separated origins allowed to send Clerk sessions, e.g. https://ideas.example.com
      authorizedParties: process.env.CLERK_AUTHORIZED_PARTIES?.split(',')
        .map((origin) => origin.trim())
        .filter(Boolean)
    }))
  ]
}))
