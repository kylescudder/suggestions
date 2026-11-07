import {
  createFileRoute,
  Link,
  useLoaderData,
  useNavigate
} from '@tanstack/react-router'
import { SignIn, UserProfile, useAuth } from '@clerk/tanstack-react-start'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { authClient } from '@/lib/auth-client'
import { AdminSignIn } from '@/components/AdminSignIn'
import { ProfileEditor } from '@/components/ProfileEditor'
import { PasskeySettings } from '@/components/PasskeySettings'
import { clearPendingSignIn } from '@/lib/pending-sign-in'

export const Route = createFileRoute('/profile')({ component: ProfilePage })

function ProfilePage() {
  const { provider } = useLoaderData({ from: '__root__' })
  return (
    <div className='min-h-screen bg-linear-to-br from-purple-900 via-blue-900 to-indigo-900 px-4 py-8 text-white sm:px-8'>
      <main className='mx-auto w-full max-w-3xl'>
        <Link to='/' className='text-purple-100 underline underline-offset-4'>
          Back to Suggestions
        </Link>
        <h1 className='mt-6 mb-8 text-3xl font-bold'>Your profile</h1>
        {provider === 'better-auth' ? <BetterAuthProfile /> : <ClerkProfile />}
      </main>
    </div>
  )
}

function ClerkProfile() {
  const { isSignedIn } = useAuth()
  return isSignedIn ? <UserProfile routing='hash' /> : <SignIn routing='hash' />
}

function BetterAuthProfile() {
  const { data: session, isPending, refetch } = authClient.useSession()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [signingOut, setSigningOut] = useState(false)
  useEffect(() => {
    if (session) clearPendingSignIn()
  }, [session])
  if (!session)
    return (
      <AdminSignIn
        sessionPending={isPending}
        onSignedIn={() => queryClient.clear()}
      />
    )
  async function signOut() {
    setSigningOut(true)
    setError('')
    try {
      const result = await authClient.signOut()
      if (result.error) {
        setError('Unable to sign out. Please try again.')
        return
      }
      queryClient.clear()
      await navigate({ to: '/' })
    } catch {
      setError('Unable to sign out. Please try again.')
    } finally {
      setSigningOut(false)
    }
  }
  return (
    <>
      <ProfileEditor
        userId={session.user.id}
        onUpdated={async () => {
          await refetch()
        }}
      />
      <PasskeySettings />
      {error && (
        <p role='alert' className='mt-6 text-red-100'>
          {error}
        </p>
      )}
      <button
        type='button'
        disabled={signingOut}
        onClick={() => void signOut()}
        className='mt-8 rounded-lg border border-white/30 px-5 py-3 text-white hover:bg-white/10 disabled:opacity-60'
      >
        {signingOut ? 'Signing out…' : 'Sign out'}
      </button>
    </>
  )
}
