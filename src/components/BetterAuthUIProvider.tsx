import type { ReactNode } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { AuthProvider } from '@/components/auth/auth-provider'
import { passkeyPlugin } from '@/lib/auth/passkey-plugin'
import { emailOtpPlugin } from '@/lib/auth/email-otp-plugin'
import { authClient } from '@/lib/auth-client'
import { profileFields, profileAvatar } from '@/lib/profile-ui'

// Sign-in from the homepage stays there so its admin view opens; the profile
// page passes its own path.
export function BetterAuthUIProvider({
  children,
  redirectTo = '/'
}: {
  children: ReactNode
  redirectTo?: string
}) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  return (
    <AuthProvider
      authClient={authClient}
      queryClient={queryClient}
      navigate={({ to, replace }) => {
        void navigate({ href: to, replace })
      }}
      Link={({ href, ...props }) => <Link to={href} {...props} />}
      redirectTo={redirectTo}
      basePaths={{ auth: '' }}
      viewPaths={{ auth: { signIn: 'profile' } }}
      emailAndPassword={{ enabled: false }}
      additionalFields={profileFields}
      avatar={profileAvatar}
      localization={{ auth: { name: 'Display name', signIn: 'Admin sign-in' } }}
      plugins={[emailOtpPlugin(), passkeyPlugin()]}
    >
      {children}
    </AuthProvider>
  )
}
