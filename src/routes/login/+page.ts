import type { PageLoad } from './$types'

// Auth.js redirects here with `?error=<code>` on sign-in / config failures
// (both `pages.signIn` and `pages.error` point at /login — see src/lib/auth.ts).
const ERROR_MESSAGES: Record<string, string> = {
  Configuration: 'There is a problem with the sign-in configuration. Please contact your administrator.',
  AccessDenied: 'Access denied. Your account is not authorized to use Blueprint.',
  Verification: 'That sign-in link has expired. Please try again.',
  OAuthSignin: 'Could not start sign-in with Microsoft. Please try again.',
  OAuthCallback: 'Microsoft sign-in failed. Please try again.',
  OAuthAccountNotLinked: 'This email is already linked to a different sign-in method.',
  Callback: 'Sign-in could not be completed. Please try again.',
  SessionRequired: 'Please sign in to continue.',
  Default: 'Something went wrong during sign-in. Please try again.',
}

export const load: PageLoad = ({ url }) => {
  const code = url.searchParams.get('error')
  const error = code ? (ERROR_MESSAGES[code] ?? ERROR_MESSAGES.Default) : null
  return { error }
}
