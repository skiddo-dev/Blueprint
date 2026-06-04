import { SvelteKitAuth } from '@auth/sveltekit'
import MicrosoftEntraID from '@auth/sveltekit/providers/microsoft-entra-id'
import { getDb } from '$lib/server/db'
import {
  AUTH_SECRET,
  AZURE_CLIENT_ID,
  AZURE_CLIENT_SECRET,
  AZURE_TENANT_ID,
  ADMIN_EMAILS,
} from '$env/static/private'

const clientId = AZURE_CLIENT_ID ?? ''
const clientSecret = AZURE_CLIENT_SECRET ?? ''
const tenantId = AZURE_TENANT_ID ?? ''

export const { handle, signIn, signOut } = SvelteKitAuth({
  providers: [
    MicrosoftEntraID({
      clientId,
      clientSecret,
      issuer: `https://login.microsoftonline.com/${tenantId}/v2.0`,
    }),
  ],
  secret: AUTH_SECRET,
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
          const adminEmails = (ADMIN_EMAILS ?? '')
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
})
