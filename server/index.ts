import { join, normalize } from 'node:path'
import { createHealthCheck } from '../src/server/health'

const revision = process.env.SUGGESTIONS_REVISION ?? 'unknown'
const clientDirectory = join(import.meta.dir, '../dist/client')
const serverEntry = '../dist/server/server.js'
const { default: app } = (await import(serverEntry)) as {
  default: { fetch: (request: Request) => Response | Promise<Response> }
}

const checkHealth = createHealthCheck(process.env.DATABASE_URL!)

// Served before the app, so health doesn't depend on Clerk or page rendering.
async function health() {
  const headers = { 'Cache-Control': 'no-store' }
  try {
    await checkHealth()
  } catch {
    return Response.json({ ok: false }, { status: 503, headers })
  }
  return Response.json({ ok: true, revision }, { headers })
}

async function staticFile(pathname: string) {
  const path = normalize(join(clientDirectory, decodeURIComponent(pathname)))
  if (!path.startsWith(clientDirectory + '/')) return null
  const file = Bun.file(path)
  if (!(await file.exists())) return null
  // Vite fingerprints everything under /assets/, so those can be cached forever.
  return new Response(file, {
    headers: {
      'Cache-Control': pathname.startsWith('/assets/')
        ? 'public, max-age=31536000, immutable'
        : 'public, max-age=3600'
    }
  })
}

async function fetch(request: Request) {
  const { pathname } = new URL(request.url)
  const response =
    pathname === '/healthz'
      ? await health()
      : (request.method === 'GET' &&
          pathname !== '/' &&
          (await staticFile(pathname))) ||
        (await app.fetch(request))
  response.headers.set('X-Suggestions-Revision', revision)
  if (pathname.startsWith('/api/'))
    response.headers.set('Cache-Control', 'no-store')
  return response
}

export default { port: Number(process.env.PORT ?? 3001), fetch }
