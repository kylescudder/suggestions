// After any sign-in method, return to the homepage with the admin dashboard
// open. A `?redirectTo=` on the auth route (e.g. from /profile) takes priority.
export const adminHome = '/?view=admin'

// Better Auth UI reads `?redirectTo=` from the URL as-is. Only follow
// same-site paths so a crafted link cannot send someone off-site after sign-in.
export function safeAppPath(to: string) {
  return to.startsWith('/') && !to.startsWith('//') && !to.includes('\\')
    ? to
    : adminHome
}
