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

  // Page navigations: try the network; if the device is offline, show the cached
  // offline fallback instead of the browser's error page. We deliberately do NOT
  // cache the per-user, auth-gated HTML — only this static fallback page.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () => {
        const cache = await caches.open(CACHE)
        return (
          (await cache.match('/offline.html')) ??
          new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } })
        )
      }),
    )
    return
  }

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
  // /api/* and auth fall through to the browser's default network handling.
})
