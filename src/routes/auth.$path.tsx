import { createFileRoute, Link, Navigate } from '@tanstack/react-router'
import { Sparkles } from 'lucide-react'
import { Auth } from '@/components/auth/auth'
import { BetterAuthUIProvider } from '@/components/BetterAuthUIProvider'

export const Route = createFileRoute('/auth/$path')({ component: AuthPage })

function AuthPage() {
  const { path } = Route.useParams()
  // Admin accounts are never self-registered.
  if (path === 'sign-up')
    return <Navigate to='/auth/$path' params={{ path: 'sign-in' }} replace />
  return (
    <div className='min-h-screen bg-linear-to-br from-purple-900 via-blue-900 to-indigo-900 px-4 py-8 text-white sm:px-8'>
      <header className='mx-auto flex max-w-sm items-center justify-between'>
        <Link to='/' className='flex items-center gap-2 text-xl font-bold'>
          <Sparkles aria-hidden='true' className='h-5 w-5' />
          Magical Ideas
        </Link>
      </header>
      <main className='mx-auto mt-8 flex w-full max-w-sm flex-col items-center gap-6 sm:mt-16'>
        <BetterAuthUIProvider>
          <Auth path={path} className='w-full text-left' />
        </BetterAuthUIProvider>
        <p className='text-center text-sm text-purple-100'>
          You can submit an idea without signing in.{' '}
          <Link to='/' className='underline underline-offset-4'>
            Back to Suggestions
          </Link>
        </p>
      </main>
    </div>
  )
}
