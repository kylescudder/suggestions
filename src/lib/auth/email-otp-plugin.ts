import { createAuthPlugin } from '@better-auth-ui/core'
import {
  emailOtpPlugin as coreEmailOtpPlugin,
  type EmailOtpPluginOptions
} from '@better-auth-ui/core/plugins/email-otp'
import { EmailOtp } from '@/components/auth/email-otp/email-otp'

// Register the sign-in card only; unsupported email/password changes stay absent.
export const emailOtpPlugin = createAuthPlugin(
  coreEmailOtpPlugin.id,
  (options: EmailOtpPluginOptions = {}) => ({
    ...coreEmailOtpPlugin(options),
    views: { auth: { emailOtp: EmailOtp } },
    fallbackViews: { auth: { signIn: EmailOtp } }
  })
)
