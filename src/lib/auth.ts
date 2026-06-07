import { SvelteKitAuth } from '@auth/sveltekit'
import MicrosoftEntraID from '@auth/sveltekit/providers/microsoft-entra-id'
import { getDb } from '$lib/server/db'
import { env } from '$env/dynamic/private'
import { requireInProd } from '$lib/server/config'

// Async config form so secrets are read at RUNTIME via $env/dynamic/private
// (from the host environment / Azure App Settings), NOT inlined at build time.
// This keeps secrets out of the build artifact and lets the container image
// build without them. Consistent with db/email/llm.
export const { handle, signIn, signOut } = SvelteKitAuth(async () => ({
  providers: [
    MicrosoftEntraID({
      clientId: requireInProd('AZURE_CLIENT_ID', env.AZURE_CLIENT_ID) ?? '',
      clientSecret: requireInProd('AZURE_CLIENT_SECRET', env.AZURE_CLIENT_SECRET) ?? '',
      issuer: `https://login.microsoftonline.com/${requireInProd('AZURE_TENANT_ID', env.AZURE_TENANT_ID) ?? ''}/v2.0`,
    }),
  ],
  secret: requireInProd('AUTH_SECRET', env.AUTH_SECRET),
  trustHost: true,
  callbacks: {
    async session({ session }) {
      const email = session.user?.email?.toLowerCase()
      if (email) {
        try {
          const db = await getDb()
          const userDoc = await db
            .collection<Record<string, unknown>>('users' as never)
            .findOne({ _id: email } as never)
          const adminEmails = (env.ADMIN_EMAILS ?? '')
            .split(',')
            .map(e => e.trim().toLowerCase())
            .filter(Boolean)
          const role: string | null = adminEmails.includes(email)
            ? 'admin'
            : ((userDoc?.role as string | null) ?? null)
          const displayName: string =
            (userDoc?.name as string) || (session.user.name ?? '') || email.split('@')[0]
          Object.assign(session.user, { role, displayName })
        } catch {
          // DB not reachable yet on cold start — degrade gracefully
        }
      }
      return session
    },
  },
  pages: {
    // Custom branded sign-in page. It must live OUTSIDE the Auth.js base path
    // (`/auth`), otherwise GET /auth/signin is intercepted by Auth.js and a
    // pages.signIn of '/auth/signin' would redirect to itself (infinite loop).
    signIn: '/login',
    error: '/login',
  },
}))
