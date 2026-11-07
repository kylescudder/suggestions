import { UserRound } from 'lucide-react'
import { UserButton } from '@/components/auth/user/user-button'
import { BetterAuthUIProvider } from '@/components/BetterAuthUIProvider'

// Loaded only for signed-in admins, keeping the auth UI out of the public page.
export function BetterAuthUserMenu() {
  return (
    <BetterAuthUIProvider>
      <UserButton
        size='icon'
        align='end'
        hideSettings
        className='ring-2 ring-white/40 hover:ring-white/70'
        links={[
          {
            label: 'Profile',
            href: '/profile',
            icon: <UserRound />,
            visibility: 'authenticated'
          }
        ]}
      />
    </BetterAuthUIProvider>
  )
}
