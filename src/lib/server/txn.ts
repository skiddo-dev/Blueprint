// Multi-document transaction helper, shared by the AR (invoicing) and AP
// (payables) flows. Posting an invoice/bill plus its journal entry, or a payment
// plus the balance update and its entry, must commit together.
//
// withTxn() uses a real transaction where the deployment supports one (Atlas in
// prod, or a local replica set) and degrades to sequential writes on a standalone
// dev mongod. The degraded path is safe because the journal post is idempotent on
// (source, source_ref), so a partial failure can be re-driven without
// double-posting; and on a standalone the session-bound write fails up front,
// before anything persists, so there's no torn state to begin with.
import type { ClientSession } from 'mongodb'
import { getClient } from './db'

let txnSupported: boolean | null = null

function isTxnUnsupported(e: unknown): boolean {
  const err = e as { code?: number; codeName?: string; message?: string }
  const msg = String(err?.message ?? '')
  return (
    err?.code === 20 ||
    err?.codeName === 'IllegalOperation' ||
    /Transaction numbers are only allowed on a replica set member or mongos|Transactions are not supported|does not support transactions/i.test(msg)
  )
}

/** Run `fn` inside a transaction when supported, else without a session. */
export async function withTxn<T>(fn: (session?: ClientSession) => Promise<T>): Promise<T> {
  if (txnSupported === false) return fn(undefined)
  const client = await getClient()
  const session = client.startSession()
  try {
    let result!: T
    await session.withTransaction(async () => { result = await fn(session) })
    txnSupported = true
    return result
  } catch (e) {
    if (isTxnUnsupported(e)) {
      txnSupported = false
      return fn(undefined) // standalone dev: re-run sequentially (nothing persisted under the session)
    }
    throw e
  } finally {
    await session.endSession()
  }
}
