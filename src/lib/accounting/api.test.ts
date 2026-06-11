import { describe, it, expect } from 'vitest'
import { apiError } from './api'

const res = (body: string, status = 400) => new Response(body, { status })

describe('apiError', () => {
  it('unwraps the JSON message envelope', async () => {
    expect(await apiError(res('{"message":"A customer name is required"}'))).toBe('A customer name is required')
  })

  it('falls back to the raw body when it is not JSON', async () => {
    expect(await apiError(res('Period is locked through 2026-05-31'))).toBe('Period is locked through 2026-05-31')
  })

  it('falls back to the raw body when JSON has no message', async () => {
    expect(await apiError(res('{"code":42}'))).toBe('{"code":42}')
  })

  it('names the status when the body is empty', async () => {
    expect(await apiError(res('', 503))).toBe('Request failed (HTTP 503)')
  })
})
