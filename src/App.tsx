import { SignIn, UserButton, useAuth } from '@clerk/react'
import { Toaster } from 'sonner'
import { MagicalSuggestionForm } from './MagicalSuggestionForm'
import { AdminDashboard } from './AdminDashboard'
import { useState } from 'react'
import { Shield, Sparkles } from 'lucide-react'

export default function App() {
  const [showAdmin, setShowAdmin] = useState(false)
  const { isSignedIn } = useAuth()

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
        <div className='mx-auto flex h-16 max-w-7xl items-center justify-between px-4'>
          <h1 className='flex items-center gap-2 text-2xl font-bold text-white'>
            <Sparkles className='h-6 w-6' />
            Magical Ideas
          </h1>

          <div className='flex items-center gap-4'>
            {isSignedIn ? (
              <>
                <button
                  onClick={() => setShowAdmin(!showAdmin)}
                  className='rounded-lg border border-white/30 bg-white/20 px-4 py-2 text-white backdrop-blur-xs transition-all duration-300 hover:bg-white/30'
                >
                  {showAdmin ? 'Public View' : 'Admin Dashboard'}
                </button>
                <UserButton />
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

      <main className='relative z-10 flex-1 p-8'>
        {isSignedIn ? (
          showAdmin ? (
            <AdminDashboard />
          ) : (
            <MagicalSuggestionForm />
          )
        ) : showAdmin ? (
          <div className='mt-20 flex justify-center'>
            <SignIn routing='hash' />
          </div>
        ) : (
          <MagicalSuggestionForm />
        )}
      </main>

      <Toaster />
    </div>
  )
}
