import adapter from '@sveltejs/adapter-node'
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    // precompress: ship .br/.gz alongside static assets + the JS bundle so the
    // node server serves them with content-encoding without compressing per request.
    // (Dynamic API JSON still relies on the ingress for compression.)
    adapter: adapter({ out: 'build', precompress: true }),
    alias: {
      $lib: 'src/lib'
    },
    // SvelteKit's built-in CSRF check runs before hooks and can't be exempted
    // per-route, which 403s Microsoft Graph's text/plain validation handshake.
    // trustedOrigins:['*'] disables the built-in origin check (the supported
    // replacement for the deprecated checkOrigin:false); the same check is
    // re-implemented in hooks.server.ts, exempting only the Graph webhook
    // (verified by clientState instead).
    csrf: { trustedOrigins: ['*'] }
  }
}

export default config
