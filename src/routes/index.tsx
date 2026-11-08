import { createFileRoute, Link } from '@tanstack/react-router'
import { MagicalSuggestionForm } from '@/components/MagicalSuggestionForm'
import { AdminDashboard } from '@/components/AdminDashboard'
import { lazy, Suspense, useEffect, useState } from 'react'
import { Shield, Sparkles } from 'lucide-react'
import type { ReactNode } from 'react'
import { authClient } from '@/lib/auth-client'
import { clearPendingSignIn } from '@/lib/pending-sign-in'

const BetterAuthUserMenu = lazy(() =>
  import('@/components/BetterAuthUserMenu').then(({ BetterAuthUserMenu }) => ({
    default: BetterAuthUserMenu
  }))
)

export const Route = createFileRoute('/')({
  // `?view=admin` opens the dashboard; sign-in returns here with it.
  validateSearch: (search: Record<string, unknown>): { view?: 'admin' } =>
    search.view === 'admin' ? { view: 'admin' } : {},
  component: Home
})

function Home() {
  const { view } = Route.useSearch()
  const openAdmin = view === 'admin'
  const { data: session } = authClient.useSession()
  useEffect(() => {
    if (session) clearPendingSignIn()
  }, [session])
  return (
    <SuggestionPage
      signedIn={!!session}
      openAdmin={openAdmin}
      account={
        <Suspense
          fallback={<span className='block size-8 rounded-full bg-white/20' />}
        >
          <BetterAuthUserMenu />
        </Suspense>
      }
    />
  )
}

function SuggestionPage({
  signedIn,
  openAdmin,
  account
}: {
  signedIn: boolean
  openAdmin: boolean
  account: ReactNode
}) {
  const [showAdmin, setShowAdmin] = useState(openAdmin)
  useEffect(() => {
    if (openAdmin) setShowAdmin(true)
  }, [openAdmin])

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
              <Link
                to='/auth/$path'
                params={{ path: 'sign-in' }}
                className='flex items-center gap-2 rounded-lg border border-white/30 bg-white/20 px-4 py-2 text-white backdrop-blur-xs transition-all duration-300 hover:bg-white/30'
              >
                <Shield className='h-4 w-4' />
                <span>Admin</span>
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className='relative z-10 flex-1 px-4 py-8 sm:px-8'>
        {signedIn && showAdmin ? <AdminDashboard /> : <MagicalSuggestionForm />}
      </main>
    </div>
  )
}
