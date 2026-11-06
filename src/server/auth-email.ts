import { createHash } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { APIError } from 'better-auth/api'
import type { db } from './db'
import { authEmailLimit } from './auth-schema'

// Persistent, atomic per-recipient cooldown/hour limits and per-app delivery
// budget. Reserve before Better Auth rotates the OTP, preserving the previous
// code when an impatient resend is refused. Do not hold a DB slot during SMTP.
export async function reserveEmailDelivery(
  database: typeof db,
  email: string,
  dailyLimit: number
) {
  const recipient = createHash('sha256')
    .update(email.trim().toLowerCase())
    .digest('hex')
  const now = new Date()
  const limits = [
    { key: 'global:day', seconds: 86400, max: dailyLimit },
    { key: `recipient:${recipient}:hour`, seconds: 3600, max: 5 },
    { key: `recipient:${recipient}:minute`, seconds: 60, max: 1 }
  ]
  await database.transaction(async (transaction) => {
    for (const limit of limits) {
      const expired = sql`${authEmailLimit.windowStartedAt} <= ${new Date(now.getTime() - limit.seconds * 1000).toISOString()}`
      const [reserved] = await transaction
        .insert(authEmailLimit)
        .values({ key: limit.key, count: 1, windowStartedAt: now })
        .onConflictDoUpdate({
          target: authEmailLimit.key,
          set: {
            count: sql`CASE WHEN ${expired} THEN 1 ELSE ${authEmailLimit.count} + 1 END`,
            windowStartedAt: sql`CASE WHEN ${expired} THEN ${now.toISOString()}::timestamptz ELSE ${authEmailLimit.windowStartedAt} END`
          },
          setWhere: sql`${expired} OR ${authEmailLimit.count} < ${limit.max}`
        })
        .returning({ count: authEmailLimit.count })
      if (!reserved)
        throw new APIError('TOO_MANY_REQUESTS', {
          message: 'Please wait before requesting another sign-in code.'
        })
    }
  })
}

export async function sendLoginEmail(
  config: { apiKey: string; from: string },
  email: string,
  otp: string
) {
  // Only validated generated six-digit codes are interpolated into the template.
  if (!/^\d{6}$/.test(otp)) throw new Error('Invalid sign-in code format')
  try {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      signal: AbortSignal.timeout(8000),
      headers: { 'api-key': config.apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender: { email: config.from, name: 'Suggestions' },
        to: [{ email }],
        subject: `${otp} is your Suggestions sign-in code`,
        textContent: `Your Suggestions sign-in code is ${otp}.\n\nIt expires in 10 minutes and can be used once. If you did not request this code, ignore this email.`,
        htmlContent: `<html><body style="margin:0;background:#312e81;font-family:system-ui,sans-serif;color:#fff"><div style="max-width:460px;margin:0 auto;padding:40px 24px"><h1 style="font-size:24px">Suggestions</h1><p>Use this code to sign in to your admin dashboard.</p><p style="font-size:36px;font-weight:700;letter-spacing:8px;background:#4338ca;padding:24px;border-radius:12px;text-align:center">${otp}</p><p>Expires in 10 minutes. This code can be used once.</p><p style="color:#ddd6fe">If you did not request this code, you can ignore this email.</p></div></body></html>`,
        tags: ['suggestions-auth']
      })
    })
    if (!response.ok) throw new Error('Provider rejected sign-in email')
  } catch {
    // Never log provider responses, API keys, OTPs or email message content.
    throw new APIError('SERVICE_UNAVAILABLE', {
      message: 'The sign-in email could not be sent. Please try again later.'
    })
  }
}
