import { createHmac } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { betterAuth } from 'better-auth'
import {
  APIError,
  createAuthMiddleware,
  getSessionFromCtx
} from 'better-auth/api'
import { emailOTP } from 'better-auth/plugins'
import { drizzleAdapter } from '@better-auth/drizzle-adapter'
import { passkey } from '@better-auth/passkey'
import type { db } from './db'
import * as schema from './auth-schema'
import { reserveEmailDelivery } from './auth-email'
import { isAllowedAdminEmail, isVerifiedAdmin } from './auth-policy'
import { userProfile } from './profile-schema'
import { profileUpdateSchema } from './profile-validation'

export type AuthSettings = {
  baseURL: string
  secret: string
  adminEmails: readonly string[]
  dailyEmailLimit: number
}

type SuggestionsAuth = {
  handler: (request: Request) => Promise<Response>
  api: {
    getSession: (input: { headers: Headers }) => Promise<{
      user: { id: string; email: string; emailVerified: boolean }
    } | null>
  }
}

export function createSuggestionsAuth(
  database: typeof db,
  settings: AuthSettings,
  sendOTP: (email: string, otp: string) => Promise<void>
): SuggestionsAuth {
  const origin = new URL(settings.baseURL).origin
  const publicPasskeyPaths = new Set([
    '/passkey/generate-authenticate-options',
    '/passkey/verify-authentication'
  ])
  const instance = betterAuth({
    appName: 'Suggestions',
    baseURL: origin,
    basePath: '/api/auth',
    secret: settings.secret,
    trustedOrigins: [origin],
    database: drizzleAdapter(database, {
      provider: 'pg',
      transaction: true,
      schema: {
        user: schema.authUser,
        session: schema.authSession,
        account: schema.authAccount,
        verification: schema.authVerification,
        passkey: schema.authPasskey,
        rateLimit: schema.authRateLimit
      }
    }),
    session: {
      expiresIn: 7 * 86400,
      updateAge: 86400,
      freshAge: 3600,
      cookieCache: { enabled: false }
    },
    emailAndPassword: { enabled: false },
    user: {
      changeEmail: { enabled: false },
      additionalFields: {
        givenName: { type: 'string', required: false, defaultValue: '' },
        familyName: { type: 'string', required: false, defaultValue: '' }
      }
    },
    advanced: {
      cookiePrefix: 'suggestions-auth',
      useSecureCookies: origin.startsWith('https://'),
      crossSubDomainCookies: { enabled: false },
      defaultCookieAttributes: { httpOnly: true, sameSite: 'lax', path: '/' },
      // The origin has no public port; only Cloudflare's tunnel reaches Caddy.
      // Cloudflare replaces this header instead of trusting a client-sent value.
      ipAddress: { ipAddressHeaders: ['cf-connecting-ip'] }
    },
    rateLimit: {
      enabled: true,
      storage: 'database',
      window: 60,
      max: 60,
      customRules: {
        '/email-otp/send-verification-otp': { window: 60, max: 3 },
        '/sign-in/email-otp': { window: 60, max: 10 },
        '/passkey/*': { window: 60, max: 20 }
      }
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path === '/update-user') {
          if (
            ctx.headers?.get('origin') !== origin ||
            ctx.headers?.get('sec-fetch-site') === 'cross-site'
          )
            throw new APIError('FORBIDDEN', {
              message: 'Cross-site request refused'
            })
          const session = await getSessionFromCtx(ctx)
          if (!isVerifiedAdmin(session?.user, settings.adminEmails))
            throw new APIError('UNAUTHORIZED', {
              message: 'Sign in with a verified admin email first'
            })
          const parsed = profileUpdateSchema.safeParse(ctx.body)
          if (!parsed.success)
            throw new APIError('BAD_REQUEST', {
              message: 'Invalid profile update'
            })
          if (parsed.data.image !== undefined) {
            const [photo] = await database
              .select({ version: userProfile.avatarVersion })
              .from(userProfile)
              .where(eq(userProfile.userId, session!.user.id))
            const expected = photo?.version
              ? '/api/profile/avatar?v=' + photo.version
              : null
            if (parsed.data.image !== expected)
              throw new APIError('BAD_REQUEST', {
                message: 'Upload or remove your profile photo first'
              })
          }
          Object.assign(ctx.body, parsed.data)
        }
        if (ctx.path === '/email-otp/send-verification-otp') {
          const requestOrigin = ctx.headers?.get('origin')
          if (
            (requestOrigin && requestOrigin !== origin) ||
            ctx.headers?.get('sec-fetch-site') === 'cross-site'
          )
            throw new APIError('FORBIDDEN', {
              message: 'Cross-site request refused'
            })
          const email =
            typeof ctx.body?.email === 'string'
              ? ctx.body.email.trim().toLowerCase()
              : ''
          if (ctx.body?.type !== 'sign-in')
            throw new APIError('BAD_REQUEST', {
              message: 'Unsupported sign-in method'
            })
          if (!isAllowedAdminEmail(email, settings.adminEmails))
            return ctx.json({ success: true })
          ctx.body.email = email
          await reserveEmailDelivery(database, email, settings.dailyEmailLimit)
        }
        if (
          ctx.path.startsWith('/passkey/') &&
          !publicPasskeyPaths.has(ctx.path)
        ) {
          const session = await getSessionFromCtx(ctx)
          if (!isVerifiedAdmin(session?.user, settings.adminEmails))
            throw new APIError('UNAUTHORIZED', {
              message: 'Sign in with a verified admin email first'
            })
        }
      })
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            if (!isAllowedAdminEmail(user.email, settings.adminEmails))
              throw new APIError('FORBIDDEN', {
                message: 'Admin access is required'
              })
            return { data: { ...user, email: user.email.trim().toLowerCase() } }
          }
        }
      }
    },
    plugins: [
      emailOTP({
        otpLength: 6,
        expiresIn: 600,
        allowedAttempts: 5,
        storeOTP: {
          hash: async (otp) =>
            createHmac('sha256', settings.secret)
              .update('suggestions-email-otp:' + otp)
              .digest('hex')
        },
        async sendVerificationOTP({ email, otp, type }) {
          if (
            type !== 'sign-in' ||
            !isAllowedAdminEmail(email, settings.adminEmails)
          )
            throw new APIError('FORBIDDEN', {
              message: 'Unsupported sign-in request'
            })
          await sendOTP(email, otp)
        }
      }),
      passkey({
        rpID: new URL(origin).hostname,
        rpName: 'Suggestions',
        origin,
        registration: { requireSession: true },
        authenticatorSelection: {
          residentKey: 'required',
          userVerification: 'required'
        }
      })
    ]
  })
  // Keep the rest of the server dependent on the two operations it uses,
  // rather than exporting every plugin's generic endpoint types.
  return {
    handler: instance.handler,
    api: { getSession: (input) => instance.api.getSession(input) }
  }
}
