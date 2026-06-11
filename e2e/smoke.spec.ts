import { test, expect, type Page } from '@playwright/test'
import { KANBAN_STATUSES } from '../src/lib/constants'

// Thin browser smoke over the rendered app — the layer unit tests can't see.
// The 2026-06-08 outage shipped with a green unit suite because nothing ever
// loaded a real page; these tests exist to catch that class of failure, not to
// re-test business logic. Keep this suite small and structural: mock data is
// random per boot, so assert shapes (columns, dialogs, charts), never titles.

// Uncaught page errors fail the test that triggered them — a board that
// "renders" but threw during hydration is not a passing smoke.
function trackPageErrors(page: Page): Error[] {
  const errors: Error[] = []
  page.on('pageerror', (e) => errors.push(e))
  return errors
}

// The board defaults to the "My Work" view, and the fake e2e user owns no mock
// cards — so every spec that needs visible cards must switch to "All Tasks"
// first (which doubles as smoke over the view toggle itself). The click is
// retried until aria-pressed flips: the SSR markup paints the button before
// Svelte hydrates its listener, so an eager click can land on dead HTML.
async function showAllTasks(page: Page) {
  const allBtn = page.getByRole('group', { name: 'Board view' }).getByRole('button', { name: 'All Tasks' })
  await expect(async () => {
    await allBtn.click()
    await expect(allBtn).toHaveAttribute('aria-pressed', 'true', { timeout: 1_000 })
  }).toPass({ timeout: 15_000 })
}

test('board renders all kanban columns with cards (dev-bypass session)', async ({ page }) => {
  const errors = trackPageErrors(page)
  await page.goto('/')
  // DEV_FAKE_AUTH signs us in as an admin; landing on /login means auth broke.
  await expect(page).not.toHaveURL(/\/login/)
  await expect(page.locator('.column')).toHaveCount(KANBAN_STATUSES.length)
  // Mock mode seeds dozens of tasks — an empty board means the load path broke.
  // ":visible" matters: filtered-out cards stay in the DOM as .card-hidden
  // (display:none) for dnd bookkeeping, so the literal first .card can be one.
  await showAllTasks(page)
  await expect(page.locator('.card:visible').first()).toBeVisible()
  expect(errors).toEqual([])
})

test('clicking a card opens and closes its detail sheet', async ({ page }) => {
  await page.goto('/')
  await showAllTasks(page)
  const firstCard = page.locator('.card:visible').first()
  const title = (await firstCard.locator('.title').innerText()).trim()
  await firstCard.click()
  const sheet = page.getByRole('dialog')
  await expect(sheet).toBeVisible()
  await expect(sheet.locator('.sheet-title')).toHaveText(title)
  await sheet.getByRole('button', { name: 'Close task details' }).click()
  await expect(sheet).toBeHidden()
})

test('dashboard renders its charts without page errors', async ({ page }) => {
  const errors = trackPageErrors(page)
  await page.goto('/dashboard')
  await expect(page.locator('canvas').first()).toBeVisible()
  expect(errors).toEqual([])
})

test('login page serves the Microsoft sign-in entry point', async ({ page }) => {
  // /login is public (guard allowlist) and is the page the outage 500'd —
  // probe it end-to-end even though the fake session never uses it.
  const errors = trackPageErrors(page)
  await page.goto('/login')
  await expect(page.getByRole('button', { name: /sign in with microsoft/i })).toBeVisible()
  expect(errors).toEqual([])
})
