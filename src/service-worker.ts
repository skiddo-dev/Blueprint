/// <reference types="@sveltejs/kit" />
/// <reference lib="webworker" />
import { build, files, version } from '$service-worker'

// `self` in a service worker is the ServiceWorkerGlobalScope, not Window.
const sw = self as unknown as ServiceWorkerGlobalScope

const CACHE = `blueprint-cache-${version}`

// Precache ONLY the immutable, content-hashed build output and static assets
// (icons, manifest, favicon). The HTML routes are deliberately excluded: they
// are per-user and auth-gated, so they must always hit the network — caching
// them could serve one signed-in user's board to the next.
const PRECACHE = [...build, ...files]

sw.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => sw.skipWaiting()),
  )
})

sw.addEventListener('activate', (event) => {
  // Drop caches from previous versions so old assets don't linger.
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => sw.clients.claim()),
  )
})

sw.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== sw.location.origin) return

  // Content-hashed assets never change within a version → serve cache-first and
  // fall back to the network only if they were somehow evicted.
  if (PRECACHE.includes(url.pathname)) {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const cached = await cache.match(request)
        return cached ?? fetch(request)
      }),
    )
  }
  // Navigations, /api/* and auth fall through to the browser's default network
  // handling — never cached.
})
