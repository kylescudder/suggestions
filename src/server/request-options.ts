import '@tanstack/react-start/server-only'
import { clerkMiddleware } from '@clerk/tanstack-react-start/server'
import { readEnv } from './env'

export function requestOptions() {
  const env = readEnv()
  return {
    requestMiddleware: [
      clerkMiddleware(() => ({
        // Comma-separated origins allowed to send Clerk sessions, e.g. https://ideas.example.com
        authorizedParties: env.CLERK_AUTHORIZED_PARTIES
      }))
    ]
  }
}
