import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import sharp from 'sharp'
import type { db } from './db'
import { authUser } from './auth-schema'
import { userProfile } from './profile-schema'
import { isVerifiedAdmin } from './auth-policy'

type Identity = { id: string; email: string; emailVerified: boolean }
type Settings = {
  origin: string
  adminEmails: readonly string[]
  getSession: (headers: Headers) => Promise<{ user: Identity } | null>
}

const privateHeaders = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Cross-Origin-Resource-Policy': 'same-origin'
}
class ProfileError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message)
  }
}

async function readBody(request: Request, limit: number) {
  if (Number(request.headers.get('content-length')) > limit)
    throw new ProfileError(413, 'This upload is too large.')
  const reader = request.body?.getReader()
  if (!reader) throw new ProfileError(400, 'Request body is required.')
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > limit) {
        await reader.cancel()
        throw new ProfileError(413, 'This upload is too large.')
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  return Buffer.concat(chunks)
}

export function createProfileHandler(database: typeof db, settings: Settings) {
  const json = (body: unknown, status = 200) =>
    Response.json(body, { status, headers: privateHeaders })
  async function profile(userId: string) {
    const [row] = await database
      .select({
        name: authUser.name,
        email: authUser.email,
        emailVerified: authUser.emailVerified,
        givenName: authUser.givenName,
        familyName: authUser.familyName,
        avatarVersion: userProfile.avatarVersion
      })
      .from(authUser)
      .leftJoin(userProfile, eq(userProfile.userId, authUser.id))
      .where(eq(authUser.id, userId))
    if (!row) throw new ProfileError(401, 'Please sign in again.')
    return {
      name: row.name,
      email: row.email,
      emailVerified: row.emailVerified,
      givenName: row.givenName ?? '',
      familyName: row.familyName ?? '',
      image: row.avatarVersion
        ? '/api/profile/avatar?v=' + row.avatarVersion
        : null
    }
  }
  return async (request: Request) => {
    try {
      const path = new URL(request.url).pathname
      const avatarRequest = path === '/api/profile/avatar'
      if (!avatarRequest && path !== '/api/profile')
        return json({ error: 'Not found' }, 404)
      if (
        request.method !== 'GET' &&
        (request.headers.get('origin') !== settings.origin ||
          request.headers.get('sec-fetch-site') === 'cross-site')
      )
        return json({ error: 'Cross-site request refused' }, 403)
      const session = await settings.getSession(request.headers)
      if (!session)
        return json({ error: 'Please sign in to manage your profile.' }, 401)
      if (!isVerifiedAdmin(session.user, settings.adminEmails))
        return json({ error: 'Admin access is required.' }, 403)
      const userId = session.user.id
      if (request.method === 'GET') {
        if (!avatarRequest) return json(await profile(userId))
        const [row] = await database
          .select({ avatar: userProfile.avatar })
          .from(userProfile)
          .where(eq(userProfile.userId, userId))
        if (!row?.avatar) return json({ error: 'No profile photo' }, 404)
        return new Response(new Uint8Array(row.avatar), {
          headers: {
            ...privateHeaders,
            'Content-Type': 'image/jpeg',
            'Content-Security-Policy': "default-src 'none'; sandbox"
          }
        })
      }
      if (avatarRequest && request.method === 'PUT') {
        if (
          !['image/jpeg', 'image/png', 'image/webp'].includes(
            request.headers.get('content-type')?.split(';')[0] ?? ''
          )
        )
          throw new ProfileError(415, 'Choose a JPEG, PNG or WebP photo.')
        const body = await readBody(request, 2 * 1024 * 1024)
        // Reject other formats before passing anything to an image decoder.
        const format = body
          .subarray(0, 3)
          .equals(Buffer.from([0xff, 0xd8, 0xff]))
          ? 'jpeg'
          : body.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))
            ? 'png'
            : body.subarray(0, 4).toString('ascii') === 'RIFF' &&
                body.subarray(8, 12).toString('ascii') === 'WEBP'
              ? 'webp'
              : null
        if (!format)
          throw new ProfileError(400, 'Choose a valid JPEG, PNG or WebP photo.')
        let avatar: Buffer
        try {
          const image = sharp(body, {
            failOn: 'error',
            limitInputPixels: 4_000_000,
            animated: false
          })
          const metadata = await image.metadata()
          if (metadata.format !== format || (metadata.pages ?? 1) > 1)
            throw new Error('Unsupported image')
          // Re-encode to remove metadata and never serve uploaded active content.
          avatar = await image
            .rotate()
            .resize(256, 256, { fit: 'cover' })
            .jpeg({ quality: 85 })
            .toBuffer()
        } catch {
          throw new ProfileError(
            400,
            'This photo could not be read. Choose a different JPEG, PNG or WebP image.'
          )
        }
        const avatarVersion = randomUUID()
        await database.transaction(async (tx) => {
          await tx
            .insert(userProfile)
            .values({ userId, avatar, avatarVersion })
            .onConflictDoUpdate({
              target: userProfile.userId,
              set: { avatar, avatarVersion, updatedAt: new Date() }
            })
          await tx
            .update(authUser)
            .set({
              image: '/api/profile/avatar?v=' + avatarVersion,
              updatedAt: new Date()
            })
            .where(eq(authUser.id, userId))
        })
        return json(await profile(userId))
      }
      if (avatarRequest && request.method === 'DELETE') {
        await database.transaction(async (tx) => {
          await tx
            .update(userProfile)
            .set({ avatar: null, avatarVersion: null, updatedAt: new Date() })
            .where(eq(userProfile.userId, userId))
          await tx
            .update(authUser)
            .set({ image: null, updatedAt: new Date() })
            .where(eq(authUser.id, userId))
        })
        return json(await profile(userId))
      }
      return json({ error: 'Method not allowed' }, 405)
    } catch (error) {
      if (error instanceof ProfileError)
        return json({ error: error.message }, error.status)
      // Never expose database or authentication details in errors.
      return json(
        { error: 'Unable to update your profile. Please try again.' },
        500
      )
    }
  }
}
