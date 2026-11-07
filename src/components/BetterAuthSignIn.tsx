import { AdminSignIn } from '@/components/AdminSignIn'
import { BetterAuthUIProvider } from '@/components/BetterAuthUIProvider'

export function BetterAuthSignIn({
  sessionPending
}: {
  sessionPending: boolean
}) {
  return (
    <BetterAuthUIProvider>
      <AdminSignIn sessionPending={sessionPending} />
    </BetterAuthUIProvider>
  )
}
