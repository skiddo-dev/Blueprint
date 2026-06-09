import { createHash, randomBytes } from 'node:crypto'

// Minimal HTTP Digest auth (RFC 2617) over the global `fetch`. The MongoDB Atlas
// Administration API authenticates programmatic API keys with Digest, which the
// platform `fetch` doesn't speak natively. The flow is a two-step handshake: the
// first request comes back 401 with a `WWW-Authenticate: Digest …` challenge, and
// we replay it with an `Authorization: Digest …` response computed from the
// challenge's nonce + the key's public/private halves.
//
// Scope is deliberately small: MD5 + qop="auth" (what Atlas sends). The hash
// builders are pure and exported so the response computation is unit-testable
// without a live endpoint.

const md5 = (s: string): string => createHash('md5').update(s).digest('hex')

export interface DigestChallenge {
  realm: string
  nonce: string
  qop?: string
  opaque?: string
  algorithm?: string
}

/** Parse the comma-separated parameters of a `WWW-Authenticate: Digest …` header
 *  into a challenge object. Tolerates quoted and unquoted values and the leading
 *  "Digest " scheme token. */
export function parseChallenge(header: string): DigestChallenge {
  const out: Record<string, string> = {}
  const body = header.replace(/^\s*Digest\s+/i, '')
  // Split on commas that separate key=value pairs (values may be quoted).
  const re = /(\w+)=(?:"([^"]*)"|([^,]*))/g
  let m: RegExpExecArray | null
  while ((m = re.exec(body))) {
    out[m[1].toLowerCase()] = (m[2] ?? m[3] ?? '').trim()
  }
  return {
    realm: out.realm ?? '',
    nonce: out.nonce ?? '',
    qop: out.qop || undefined,
    opaque: out.opaque || undefined,
    algorithm: out.algorithm || undefined,
  }
}

/** Build the `Authorization: Digest …` header value for one request. `uri` is the
 *  request-target (path + query), NOT the full URL — it's hashed into HA2 and
 *  echoed in the header, and a mismatch fails the server's check. `cnonce`/`nc`
 *  are injectable so tests are deterministic. */
export function buildDigestHeader(opts: {
  method: string
  uri: string
  username: string
  password: string
  challenge: DigestChallenge
  cnonce?: string
  nc?: string
}): string {
  const { method, uri, username, password, challenge } = opts
  const cnonce = opts.cnonce ?? randomBytes(8).toString('hex')
  const nc = opts.nc ?? '00000001'
  const ha1 = md5(`${username}:${challenge.realm}:${password}`)
  const ha2 = md5(`${method.toUpperCase()}:${uri}`)
  const response = challenge.qop
    ? md5(`${ha1}:${challenge.nonce}:${nc}:${cnonce}:${challenge.qop}:${ha2}`)
    : md5(`${ha1}:${challenge.nonce}:${ha2}`)

  const parts = [
    `username="${username}"`,
    `realm="${challenge.realm}"`,
    `nonce="${challenge.nonce}"`,
    `uri="${uri}"`,
    `response="${response}"`,
  ]
  if (challenge.algorithm) parts.push(`algorithm=${challenge.algorithm}`)
  if (challenge.qop) parts.push(`qop=${challenge.qop}`, `nc=${nc}`, `cnonce="${cnonce}"`)
  if (challenge.opaque) parts.push(`opaque="${challenge.opaque}"`)
  return `Digest ${parts.join(', ')}`
}

/** GET `url` with HTTP Digest auth. Sends an unauthenticated probe, reads the
 *  401 challenge, then replays the request with the computed Authorization
 *  header. Any non-401 first response (e.g. a server that doesn't require auth,
 *  or an error) is returned as-is. */
export async function digestFetch(
  url: string,
  opts: { username: string; password: string; headers?: Record<string, string>; method?: string },
): Promise<Response> {
  const method = opts.method ?? 'GET'
  const headers = opts.headers ?? {}
  const probe = await fetch(url, { method, headers })
  if (probe.status !== 401) return probe

  const wwwAuth = probe.headers.get('www-authenticate')
  if (!wwwAuth) return probe
  const challenge = parseChallenge(wwwAuth)
  const { pathname, search } = new URL(url)
  const authorization = buildDigestHeader({
    method,
    uri: pathname + search,
    username: opts.username,
    password: opts.password,
    challenge,
  })
  return fetch(url, { method, headers: { ...headers, authorization } })
}
