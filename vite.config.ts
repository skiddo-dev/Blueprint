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
    },
    coverage: {
      provider: 'v8',
      // Measure all TypeScript source, not just files the tests happen to load —
      // untested modules must show up as 0%, or the number flatters itself.
      // .svelte components are excluded: they're exercised by the Playwright e2e
      // suite (e2e/), not unit tests, and v8 line-mapping through the Svelte
      // compiler is noise rather than signal.
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.{test,spec}.ts', 'src/**/*.d.ts'],
      reporter: ['text-summary', 'html', 'json-summary'],
      // Ratchet, not target: a few points under the measured baseline
      // (2026-06-11: lines 43.97 / functions 46.29 / statements 43.64 /
      // branches 39.37) so a PR that ships a large untested module fails CI
      // while normal variance doesn't. Raise these as coverage grows; never
      // lower them to make a PR pass.
      thresholds: {
        lines: 40,
        functions: 42,
        statements: 40,
        branches: 36
      }
    }
  }
})
