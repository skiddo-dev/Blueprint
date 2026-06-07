import { SvelteKitAuth } from '@auth/sveltekit'
import MicrosoftEntraID from '@auth/sveltekit/providers/microsoft-entra-id'
import { getDb } from '$lib/server/db'
import { env } from '$env/dynamic/private'
import { requireInProd } from '$lib/server/config'

// How long a resolved role/displayName stays cached in the JWT before the jwt
// callback re-checks Mongo. Bounds two things at once: how stale a provisioned
// user's role can be (e.g. a removed user keeps access this long) and how often
// the hot path touches the DB. 60s makes the board's 2s poll re-query auth ~once
// a minute instead of every tick, while keeping role changes near-immediate.
const ROLE_TTL_MS = 60_000

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
    // Resolve role + displayName into the (JWT) token, NOT the session callback.
    // session() runs on every locals.auth() call — i.e. every request, including
    // the board's 2s signature poll — so doing the Mongo lookup there meant a
    // users.findOne per request per open client. The jwt callback runs far less
    // often, and we further throttle the DB hit (see below), so a steady-state
    // poll now touches the users collection at most once per ROLE_TTL_MS.
    async jwt({ token, user, trigger }) {
      // token.email is populated by Auth.js from the profile on sign-in; `user`
      // is only set on that first call.
      const email = ((user?.email ?? token.email) as string | undefined)?.toLowerCase()
      if (!email) return token

      // Re-query only when it can actually matter: first sign-in (user set), an
      // explicit client update(), an un-provisioned token (role still null — those
      // users are waiting on approval and must see it on their next request), or
      // once the cached value has aged past the TTL. A provisioned user's role
      // almost never changes, so the common path skips the DB entirely.
      const now = Date.now()
      const checkedAt = (token.roleCheckedAt as number | undefined) ?? 0
      const fresh = now - checkedAt < ROLE_TTL_MS && token.role != null
      if (!user && trigger !== 'update' && fresh) return token

      try {
        const db = await getDb()
        const userDoc = await db
          .collection<Record<string, unknown>>('users' as never)
          .findOne({ _id: email } as never)
        const adminEmails = (env.ADMIN_EMAILS ?? '')
          .split(',')
          .map(e => e.trim().toLowerCase())
          .filter(Boolean)
        token.role = adminEmails.includes(email)
          ? 'admin'
          : ((userDoc?.role as string | null) ?? null)
        token.displayName =
          (userDoc?.name as string) || (token.name as string) || email.split('@')[0]
        token.roleCheckedAt = now
      } catch {
        // DB not reachable yet on cold start — degrade gracefully and retry on the
        // next request (roleCheckedAt is left unchanged so we don't cache a miss).
      }
      return token
    },
    // Project the token-resolved fields onto the session the app reads. No DB.
    async session({ session, token }) {
      if (session.user) {
        Object.assign(session.user, {
          role: (token.role as string | null) ?? null,
          displayName:
            (token.displayName as string) ||
            session.user.name ||
            (session.user.email?.split('@')[0] ?? ''),
        })
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
