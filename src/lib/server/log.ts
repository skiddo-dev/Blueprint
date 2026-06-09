// Minimal structured logger: one JSON object per line, easy to filter in the
// Container Apps log stream (level/path/id fields).
//
// Error-level logs are ALSO forwarded to an optional alert sink (ALERT_WEBHOOK_URL)
// so background-job / sync / Graph / OpenAI failures page a human instead of dying
// silently in the log stream. The sink is the seam the rest of the app builds on:
// to swap a Slack/Teams webhook for an APM / error tracker (App Insights, Sentry,
// …), change `dispatchAlert` below and nothing else moves.
import { env } from '$env/dynamic/private'

type Level = 'info' | 'warn' | 'error'
type Fields = Record<string, unknown>

// Optional: a Slack/Teams incoming-webhook URL (or any endpoint that accepts a
// JSON POST). Unset → alerting is a no-op, the same "every integration is
// optional" convention as the Infra Spend cards. Read once at module load.
const ALERT_WEBHOOK_URL = env.ALERT_WEBHOOK_URL ?? ''

// Dedup window: the same message alerts at most once per this interval so a tight
// failure loop can't flood the channel. Keyed on the (static) message, not the
// per-call fields, which is why call sites pass a constant msg + structured
// fields. Per-replica (worst case across the up-to-2 replicas is a couple of
// duplicate pages — the safe direction).
const ALERT_THROTTLE_MS = 5 * 60_000
const lastAlertAt = new Map<string, number>()

/** Whether `msg` is due to alert given when it last fired — pure so the
 *  throttle/dedup window is unit-tested without timers or a live webhook. Reads
 *  but never mutates `last`; the caller stamps it only when this returns true. */
export function alertDue(
  msg: string,
  now: number,
  last: Map<string, number> = lastAlertAt,
  throttleMs: number = ALERT_THROTTLE_MS,
): boolean {
  return now - (last.get(msg) ?? 0) >= throttleMs
}

function dispatchAlert(msg: string, fields: Fields): void {
  if (!ALERT_WEBHOOK_URL) return
  const now = Date.now()
  if (!alertDue(msg, now)) return
  lastAlertAt.set(msg, now)
  // Slack & Teams both accept a { text } payload; keep the structured fields
  // alongside it for richer sinks. Fire-and-forget: alerting must never throw
  // into or block the caller, and a failed alert must not cascade into more
  // error logs (hence the silent catch).
  const text = `🚨 Blueprint: ${msg}${Object.keys(fields).length ? ` ${JSON.stringify(fields)}` : ''}`
  fetch(ALERT_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text, msg, ...fields, ts: new Date().toISOString() }),
  }).catch(() => {})
}

function emit(level: Level, msg: string, fields: Fields = {}): void {
  const line = JSON.stringify({ level, msg, ...fields, ts: new Date().toISOString() })
  if (level === 'error') {
    console.error(line)
    dispatchAlert(msg, fields)
  } else if (level === 'warn') {
    console.warn(line)
  } else {
    console.log(line)
  }
}

export const log = {
  info: (msg: string, fields?: Fields) => emit('info', msg, fields),
  warn: (msg: string, fields?: Fields) => emit('warn', msg, fields),
  error: (msg: string, fields?: Fields) => emit('error', msg, fields),
}
