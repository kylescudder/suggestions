export function isVerifiedAdmin(
  user: { email: string; emailVerified: boolean } | null | undefined,
  adminEmails: readonly string[]
) {
  return (
    !!user?.emailVerified &&
    adminEmails.includes(user.email.trim().toLowerCase())
  )
}

export function isAllowedAdminEmail(
  email: string,
  adminEmails: readonly string[]
) {
  return adminEmails.includes(email.trim().toLowerCase())
}
