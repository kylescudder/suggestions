import { SignIn, UserButton, useAuth } from '@clerk/tanstack-react-start'
import { createFileRoute, Link, useLoaderData } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { MagicalSuggestionForm } from '@/components/MagicalSuggestionForm'
import { AdminDashboard } from '@/components/AdminDashboard'
import { lazy, Suspense, useEffect, useState } from 'react'
import { Shield, Sparkles, UserRound } from 'lucide-react'
import type { ReactNode } from 'react'
import { authClient } from '@/lib/auth-client'
import { clearPendingSignIn, readPendingSignIn } from '@/lib/pending-sign-in'

const BetterAuthSignIn = lazy(() =>
  import('@/components/BetterAuthSignIn').then(({ BetterAuthSignIn }) => ({
    default: BetterAuthSignIn
  }))
)

export const Route = createFileRoute('/')({
  component: Home
})

function Home() {
  const { provider } = useLoaderData({ from: '__root__' })
  return provider === 'clerk' ? <ClerkHome /> : <BetterAuthHome />
}

function ClerkHome() {
  const { isSignedIn } = useAuth()
  return (
    <SuggestionPage
      signedIn={!!isSignedIn}
      account={<UserButton />}
      signIn={<SignIn routing='hash' />}
    />
  )
}

function BetterAuthHome() {
  const { data: session, isPending } = authClient.useSession()
  const queryClient = useQueryClient()
  const [error, setError] = useState('')
  useEffect(() => {
    if (session) clearPendingSignIn()
  }, [session])
  async function signOut() {
    setError('')
    try {
      const result = await authClient.signOut()
      if (result.error) setError('Unable to sign out. Please try again.')
      else queryClient.clear()
    } catch {
      setError('Unable to sign out. Please try again.')
    }
  }
  return (
    <SuggestionPage
      signedIn={!!session}
      resumeSignIn
      account={
        <>
          <Link
            to='/profile'
            className='flex items-center gap-2 rounded-lg border border-white/30 px-3 py-2 text-sm text-white hover:bg-white/10'
          >
            <UserRound aria-hidden='true' className='h-4 w-4' /> Profile
          </Link>
          <button
            onClick={() => void signOut()}
            className='rounded-lg border border-white/30 px-3 py-2 text-sm text-white hover:bg-white/10'
          >
            Sign out
          </button>
        </>
      }
      signIn={
        <Suspense
          fallback={
            <p role='status' className='text-center text-white'>
              Loading sign-in…
            </p>
          }
        >
          <BetterAuthSignIn sessionPending={isPending} />
        </Suspense>
      }
      error={error}
    />
  )
}

function SuggestionPage({
  signedIn,
  account,
  signIn,
  error,
  resumeSignIn = false
}: {
  signedIn: boolean
  account: ReactNode
  signIn: ReactNode
  error?: string
  resumeSignIn?: boolean
}) {
  const [showAdmin, setShowAdmin] = useState(false)
  useEffect(() => {
    if (resumeSignIn && readPendingSignIn()) setShowAdmin(true)
  }, [resumeSignIn])

  return (
    <div className='relative min-h-screen overflow-hidden bg-linear-to-br from-purple-900 via-blue-900 to-indigo-900'>
      {/* Animated background sparkles */}
      <div className='pointer-events-none absolute inset-0 overflow-hidden'>
        <div className='sparkle sparkle-1'></div>
        <div className='sparkle sparkle-2'></div>
        <div className='sparkle sparkle-3'></div>
        <div className='sparkle sparkle-4'></div>
        <div className='sparkle sparkle-5'></div>
        <div className='sparkle sparkle-6'></div>
      </div>

      <header className='relative z-10 border-b border-white/20 bg-white/10 backdrop-blur-md'>
        <div className='mx-auto flex min-h-16 max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3'>
          <h1 className='flex items-center gap-2 text-2xl font-bold text-white'>
            <Sparkles className='h-6 w-6' />
            Magical Ideas
          </h1>

          <div className='flex items-center gap-4'>
            {signedIn ? (
              <>
                <button
                  onClick={() => setShowAdmin(!showAdmin)}
                  className='rounded-lg border border-white/30 bg-white/20 px-4 py-2 text-white backdrop-blur-xs transition-all duration-300 hover:bg-white/30'
                >
                  {showAdmin ? 'Public View' : 'Admin Dashboard'}
                </button>
                {account}
              </>
            ) : (
              <button
                onClick={() => setShowAdmin(!showAdmin)}
                className='flex items-center gap-2 rounded-lg border border-white/30 bg-white/20 px-4 py-2 text-white backdrop-blur-xs transition-all duration-300 hover:bg-white/30'
              >
                <Shield className='h-4 w-4' />
                <span>Admin</span>
              </button>
            )}
          </div>
        </div>
      </header>

      <main className='relative z-10 flex-1 px-4 py-8 sm:px-8'>
        {error && (
          <p role='alert' className='mb-4 text-center text-red-200'>
            {error}
          </p>
        )}
        {signedIn ? (
          showAdmin ? (
            <>
              <AdminDashboard />
            </>
          ) : (
            <MagicalSuggestionForm />
          )
        ) : showAdmin ? (
          signIn
        ) : (
          <MagicalSuggestionForm />
        )}
      </main>
    </div>
  )
}
