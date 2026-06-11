import { defineConfig, devices } from '@playwright/test'

// E2E smoke suite. Runs against `vite dev` because the two flags it depends on
// are dev-only by design: DEV_FAKE_AUTH (the auth bypass is stripped from
// production builds — see hooks.server.ts) and USE_MOCK_DATA (generated board
// data, no Mongo needed). This is the same known-good combination the iOS
// simulator verification uses. Port 3998 deliberately avoids 8501 (local dev)
// and 3999 (boot smoke) so the suite never reuses a stale server by accident.
const PORT = 3998

export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  // Mock data is regenerated per server boot, so tests must not assume specific
  // card titles — only structure. One retry in CI absorbs slow cold starts.
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev',
    url: `http://127.0.0.1:${PORT}/healthz`,
    reuseExistingServer: false,
    timeout: 90_000,
    env: {
      PORT: String(PORT),
      USE_MOCK_DATA: 'true',
      DEV_FAKE_AUTH: 'true',
      ADMIN_EMAILS: 'e2e@local',
      AUTH_SECRET: 'e2e-smoke-secret',
      // Unreachable on purpose: mock mode promises the app renders with no
      // Mongo, and a developer's local mongod must never quietly fill a
      // coverage hole here that then 500s in CI (it happened: getUsersByRole
      // wasn't mock-aware, local runs passed, CI had no Mongo and failed).
      MONGODB_URI: 'mongodb://127.0.0.1:1/e2e-must-not-connect',
    },
  },
})
