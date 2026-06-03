import { SvelteKitAuth } from '@auth/sveltekit'
import MicrosoftEntraID from '@auth/sveltekit/providers/microsoft-entra-id'
import { getDb } from '$lib/server/db'

// Auth.js reads AUTH_MICROSOFT_ENTRA_ID_* automatically.
// We also accept the legacy AZURE_* names used by the Python version.
const clientId = process.env.AUTH_MICROSOFT_ENTRA_ID_ID ?? process.env.AZURE_CLIENT_ID ?? ''
const clientSecret = process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET ?? process.env.AZURE_CLIENT_SECRET ?? ''
const tenantId = process.env.AUTH_MICROSOFT_ENTRA_ID_TENANT_ID ?? process.env.AZURE_TENANT_ID ?? ''

export const { handle, signIn, signOut } = SvelteKitAuth({
  providers: [
    MicrosoftEntraID({
      clientId,
      clientSecret,
      issuer: `https://login.microsoftonline.com/${tenantId}/v2.0`,
    }),
  ],
  secret: process.env.AUTH_SECRET,
  trustHost: true,
  callbacks: {
    async session({ session }) {
      const email = session.user?.email?.toLowerCase()
      if (email) {
        try {
          const db = await getDb()
          const userDoc = await db.collection<Record<string, unknown>>('users' as never).findOne({ _id: email } as never)
          const adminEmails = (process.env.ADMIN_EMAILS ?? '')
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
          // DB not yet reachable on cold start — degrade gracefully
        }
      }
      return session
    },
  },
  pages: {
    signIn: '/auth/signin',
    error: '/auth/signin',
  },
})
