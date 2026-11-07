import { createFileRoute } from '@tanstack/react-router'
import { handleProfileRequest } from '@/server/profile'

export const Route = createFileRoute('/api/profile')({
  server: {
    handlers: {
      GET: ({ request }) => handleProfileRequest(request)
    }
  }
})
