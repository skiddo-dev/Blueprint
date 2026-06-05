import adapter from '@sveltejs/adapter-node'
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({ out: 'build' }),
    alias: {
      $lib: 'src/lib'
    },
    // SvelteKit's built-in CSRF check runs before hooks and can't be exempted
    // per-route, which 403s Microsoft Graph's text/plain validation handshake.
    // Disable it here and re-implement the same origin check in hooks.server.ts,
    // exempting only the Graph webhook (which is verified by clientState instead).
    csrf: { checkOrigin: false }
  }
}

export default config
