import type { ReactNode } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { AuthProvider } from '@/components/auth/auth-provider'
import { passkeyPlugin } from '@/lib/auth/passkey-plugin'
import { authClient } from '@/lib/auth-client'
import { profileFields, profileAvatar } from '@/lib/profile-ui'

export function BetterAuthUIProvider({ children }: { children: ReactNode }) {
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
      redirectTo='/profile'
      basePaths={{ auth: '' }}
      viewPaths={{ auth: { signIn: 'profile' } }}
      emailAndPassword={{ enabled: false }}
      additionalFields={profileFields}
      avatar={profileAvatar}
      localization={{ auth: { name: 'Display name' } }}
      plugins={[passkeyPlugin()]}
    >
      {children}
    </AuthProvider>
  )
}
