import { json, error } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { postEntry, getAccounts } from '$lib/server/accounting'
import { writeAudit } from '$lib/server/audit'
import { actorOf } from '$lib/server/authz'
import { usd } from '$lib/accounting/format'
import { parseMoney, cents } from '$lib/money'

// Admin-only. Quick expense entry — QuickBooks' "Expense" transaction: money
// spent without a bill. One balanced journal entry: Dr the expense account /
// Cr the bank account it was paid from. The server validates the account
// types so a typo can't post an expense against, say, Retained Earnings.
export const POST: RequestHandler = async ({ request, locals }) => {
  const session = await locals.auth()
  const user = session?.user as Record<string, unknown> | undefined
  if (!user) throw error(401)
  if (user.role !== 'admin') throw error(403)

  const body = await request.json().catch(() => null)
  if (!body || !body.account_id || !body.paid_from || body.amount === undefined || body.amount === '') {
    throw error(400, 'Expected { date, account_id, paid_from, amount }')
  }

  let amount
  try {
    amount = parseMoney(typeof body.amount === 'number' ? body.amount : String(body.amount))
  } catch (e) {
    throw error(400, `Invalid amount: ${e instanceof Error ? e.message : String(e)}`)
  }
  if (amount <= 0) throw error(400, 'Amount must be positive')

  const accounts = await getAccounts()
  const expense = accounts.find((a) => a._id === String(body.account_id))
  const bank = accounts.find((a) => a._id === String(body.paid_from))
  if (!expense || expense.type !== 'expense') throw error(400, 'account_id must be an expense account')
  if (!bank || bank.subtype !== 'bank') throw error(400, 'paid_from must be a bank account')

  const memo = [body.payee ? String(body.payee) : '', body.memo ? String(body.memo) : '']
    .filter(Boolean)
    .join(' — ')

  try {
    const entry = await postEntry({
      date: String(body.date ?? new Date().toISOString().slice(0, 10)).trim(),
      memo: memo || `Expense — ${expense.name}`,
      source: 'expense',
      ...(body.job ? { job: String(body.job) } : {}),
      lines: [
        { account_id: expense._id, debit: amount, credit: cents(0) },
        { account_id: bank._id, debit: cents(0), credit: amount },
      ],
      created_by: (user.email as string) ?? (user.displayName as string),
    })
    await writeAudit({
      actor: actorOf(user),
      action: 'expense.create',
      entity_type: 'journal-entry',
      entity_id: entry._id,
      summary: `Expense ${usd(amount)} — ${expense.name}${body.payee ? ` — ${String(body.payee)}` : ''}`,
    })
    return json(entry, { status: 201 })
  } catch (e) {
    throw error(400, e instanceof Error ? e.message : String(e))
  }
}
