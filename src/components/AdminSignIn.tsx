import { EmailOtp } from '@/components/auth/email-otp/email-otp'

export function AdminSignIn({
  sessionPending = false
}: {
  sessionPending?: boolean
}) {
  return (
    <EmailOtp
      className='mx-auto mt-8 sm:mt-16'
      sessionPending={sessionPending}
    />
  )
}
