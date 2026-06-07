import { env } from '$env/dynamic/private'

// Environment variables the app cannot safely run without in production. Without
// them the app would otherwise fall back SILENTLY to blank Entra credentials
// (src/lib/auth.ts), a localhost Mongo (src/lib/server/db.ts), or a keyless
// OpenAI client (src/lib/server/openai.ts) — a deploy that looks healthy but
// can't authenticate, persist, or parse. Validated at startup (hooks.server.ts)
// and surfaced by /readyz.
export const REQUIRED_PROD_ENV = [
  'AUTH_SECRET',
  'AZURE_CLIENT_ID',
  'AZURE_CLIENT_SECRET',
  'AZURE_TENANT_ID',
  'MONGODB_URI',
  'OPENAI_API_KEY',
  'ADMIN_EMAILS',
] as const

/** Names of required production env vars that are missing or blank. The reader is
 *  injectable for testing; it defaults to $env/dynamic/private. */
export function missingProdEnv(read: (k: string) => string | undefined = (k) => env[k]): string[] {
  return REQUIRED_PROD_ENV.filter((k) => !(read(k) ?? '').trim())
}

/** Return `value`, but in production throw if it's missing/blank — so a config
 *  module's dev convenience fallback (localhost Mongo, blank Entra creds, keyless
 *  OpenAI) can never silently take effect in prod, even via a non-hooks entry
 *  point. Belt-and-suspenders alongside the startup guard in hooks.server.ts. */
export function requireInProd(
  key: string,
  value: string | undefined,
  isProd = process.env.NODE_ENV === 'production',
): string | undefined {
  if (isProd && !value?.trim()) throw new Error(`${key} is required in production`)
  return value
}
