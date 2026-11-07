import { useEffect, useState } from 'react'
import { KeyRound, Mail, ShieldCheck } from 'lucide-react'
import { authClient } from '@/lib/auth-client'
import {
  clearPendingSignIn,
  emailCodeLifetime,
  readPendingSignIn,
  savePendingSignIn
} from '@/lib/pending-sign-in'

const inputClass =
  'w-full rounded-lg border border-white/30 bg-white/10 px-4 py-3 text-white placeholder:text-purple-200/70 focus:outline-none focus:ring-2 focus:ring-purple-300'
const buttonClass =
  'w-full rounded-lg bg-purple-400 px-4 py-3 font-semibold text-purple-950 transition hover:bg-purple-300 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-purple-200 disabled:cursor-wait disabled:opacity-60'

export function AdminSignIn({
  onSignedIn,
  sessionPending = false
}: {
  onSignedIn: () => void
  sessionPending?: boolean
}) {
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [sentAt, setSentAt] = useState<number | null>(null)
  const [now, setNow] = useState(Date.now)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const sent = sentAt !== null
  const cooldown =
    sentAt === null ? 0 : Math.max(0, Math.ceil((sentAt + 60_000 - now) / 1000))
  const disabled = busy || sessionPending

  useEffect(() => {
    const pending = readPendingSignIn()
    if (pending) {
      setEmail(pending.email)
      setSentAt(pending.sentAt)
      setNow(Date.now())
    }
  }, [])

  useEffect(() => {
    if (sentAt === null) return
    const updateClock = () => setNow(Date.now())
    const timer = setInterval(updateClock, 1000)
    window.addEventListener('focus', updateClock)
    document.addEventListener('visibilitychange', updateClock)
    return () => {
      clearInterval(timer)
      window.removeEventListener('focus', updateClock)
      document.removeEventListener('visibilitychange', updateClock)
    }
  }, [sentAt])

  useEffect(() => {
    if (sentAt === null || now - sentAt < emailCodeLifetime) return
    clearPendingSignIn()
    setSentAt(null)
    setOtp('')
    setError('That code has expired. Request a new code to continue.')
  }, [now, sentAt])

  async function sendCode() {
    if (disabled) return
    setBusy(true)
    setError('')
    const requestedAt = Date.now()
    try {
      const result = await authClient.emailOtp.sendVerificationOtp({
        email: email.trim().toLowerCase(),
        type: 'sign-in'
      })
      if (result.error) {
        setError(
          result.error.message ??
            'Unable to send a code. Please try again later.'
        )
        return
      }
      savePendingSignIn({
        email: email.trim().toLowerCase(),
        sentAt: requestedAt
      })
      setSentAt(requestedAt)
      setOtp('')
      setNow(Date.now())
    } catch {
      setError('Unable to reach sign-in. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  async function verifyCode() {
    if (disabled) return
    setBusy(true)
    setError('')
    try {
      const result = await authClient.signIn.emailOtp({
        email: email.trim().toLowerCase(),
        otp
      })
      if (result.error) {
        setError(
          'That code could not be verified. Check the code or request a new one.'
        )
        return
      }
      clearPendingSignIn()
      onSignedIn()
    } catch {
      setError('Unable to reach sign-in. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  async function signInWithPasskey() {
    if (disabled) return
    setBusy(true)
    setError('')
    try {
      const result = await authClient.signIn.passkey()
      if (!result || result.error) {
        setError(
          'Passkey sign-in was not completed. Try again or use an email code.'
        )
        return
      }
      clearPendingSignIn()
      onSignedIn()
    } catch {
      setError(
        'Passkey sign-in is unavailable. You can use an email code instead.'
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <section
      aria-labelledby='admin-sign-in-title'
      className='mx-auto mt-8 max-w-md rounded-2xl border border-white/20 bg-white/10 p-6 shadow-xl backdrop-blur-md sm:mt-16 sm:p-8'
    >
      <ShieldCheck
        aria-hidden='true'
        className='mb-4 h-8 w-8 text-purple-200'
      />
      <h2 id='admin-sign-in-title' className='text-2xl font-bold text-white'>
        Admin sign-in
      </h2>
      <p className='mt-2 mb-6 text-purple-100'>
        Use your admin email to get a sign-in code, or use a passkey you have
        already saved.
      </p>
      {sessionPending && (
        <p role='status' className='mb-4 text-purple-100'>
          Checking sign-in…
        </p>
      )}
      <form
        onSubmit={(event) => {
          event.preventDefault()
          void (sent ? verifyCode() : sendCode())
        }}
        className='space-y-4'
      >
        <div>
          <label
            htmlFor='admin-email'
            className='mb-2 block font-medium text-white'
          >
            Email address
          </label>
          <input
            id='admin-email'
            type='email'
            autoComplete='email webauthn'
            required
            maxLength={254}
            value={email}
            disabled={disabled || sent}
            onChange={(event) => setEmail(event.target.value)}
            className={inputClass}
          />
        </div>
        {sent && (
          <>
            <p role='status' className='text-sm text-purple-100'>
              If this email has admin access, a code is on its way. It expires
              in 10 minutes.
            </p>
            <div>
              <label
                htmlFor='admin-code'
                className='mb-2 block font-medium text-white'
              >
                Six-digit code
              </label>
              <input
                id='admin-code'
                type='text'
                inputMode='numeric'
                autoComplete='one-time-code'
                pattern='[0-9]{6}'
                minLength={6}
                maxLength={6}
                required
                autoFocus
                value={otp}
                disabled={disabled}
                onChange={(event) =>
                  setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))
                }
                className={`${inputClass} text-center text-2xl tracking-[0.4em]`}
              />
            </div>
          </>
        )}
        {error && (
          <p
            role='alert'
            className='rounded-lg border border-red-300/40 bg-red-950/30 p-3 text-sm text-red-100'
          >
            {error}
          </p>
        )}
        <button
          type='submit'
          disabled={disabled || (sent && otp.length !== 6)}
          className={buttonClass}
        >
          {busy ? (
            'Please wait…'
          ) : sent ? (
            'Verify and sign in'
          ) : (
            <span className='flex items-center justify-center gap-2'>
              <Mail className='h-4 w-4' />
              Send sign-in code
            </span>
          )}
        </button>
      </form>
      {sent && (
        <div className='mt-4 flex flex-wrap justify-between gap-3 text-sm text-purple-100'>
          <button
            type='button'
            disabled={disabled || cooldown > 0}
            onClick={() => void sendCode()}
            className='underline underline-offset-4 disabled:opacity-60'
          >
            {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
          </button>
          <button
            type='button'
            disabled={disabled}
            onClick={() => {
              clearPendingSignIn()
              setSentAt(null)
              setOtp('')
              setError('')
            }}
            className='underline underline-offset-4'
          >
            Use another email
          </button>
        </div>
      )}
      <div className='my-6 border-t border-white/20' />
      <button
        type='button'
        onClick={() => void signInWithPasskey()}
        disabled={disabled}
        className='flex w-full items-center justify-center gap-2 rounded-lg border border-white/30 px-4 py-3 font-medium text-white transition hover:bg-white/10 disabled:opacity-60'
      >
        <KeyRound className='h-4 w-4' />
        Sign in with a passkey
      </button>
      <p className='mt-6 text-sm text-purple-200'>
        Sign in with an email code first to save a passkey. You can submit an
        idea without signing in.
      </p>
    </section>
  )
}
