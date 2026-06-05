import { sveltekit } from '@sveltejs/kit/vite'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [sveltekit()],
  server: {
    port: Number(process.env.PORT) || 8501
  },
  // Unit tests run in Node and reach server-only modules ($lib/server/*), so the
  // SvelteKit plugin above is needed to resolve $lib and the $env/* virtuals.
  test: {
    include: ['src/**/*.{test,spec}.{js,ts}'],
    // Server modules read config via $env/dynamic/private (→ process.env).
    // Give them harmless defaults so an import never trips on a missing key.
    env: {
      MONGODB_URI: 'mongodb://localhost:27017/',
      OPENAI_API_KEY: 'test-key'
    }
  }
})
