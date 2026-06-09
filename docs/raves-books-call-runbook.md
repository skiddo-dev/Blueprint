# Raves Blueprint Books Call Runbook

Internal use. Use this to run the 30-minute meeting that sells Blueprint Books (construction financial control) as the next funded phase.

Date: June 9, 2026  
Meeting goal: decide whether Blueprint Books should move into a fixed-scope SOW, who approves it, and where opening balances and the chart of accounts come from.

## Where This Fits

Blueprint Books is a new rung on the offer ladder in `docs/raves-sales-command-center.md`:

1. Field Rollout + Reliability Sprint — makes Blueprint dependable from office to jobsite.
2. Platform Care — ongoing monitoring, fixes, and small enhancements.
3. **Blueprint Books — construction financial control (this runbook).**
4. Sales Workflow Sprint — quote approvals, reminders, accept/decline tracking.
5. Light CRM Sprint — prospect outreach and follow-up.

Sequencing guidance:

- Books is strongest **after** Field Rollout + Reliability, because the team must already trust Blueprint daily before they trust it with the books.
- If Raves is paying for QuickBooks plus spreadsheets and the office is the bottleneck, Books can lead.
- If the field-access pain is louder than the back-office pain, recommend Field Rollout first and tee up Books as the phase after.

## What Is Actually Built (Do Not Oversell)

Already shipped and demoable in Blueprint:

- Construction chart of accounts: retainage receivable/payable, costs/billings in excess (WIP), change-order revenue, job-cost COGS categories.
- Customers, invoices, payments recorded, and A/R aging.
- Vendors, bills, bill payments, and A/P aging.
- Manual journal entries and a live trial balance.
- Income statement and balance sheet.
- Period close (lock through a date).
- Branded invoice and bill PDFs.
- Integer-cents money and transactional, double-entry posting.

Not yet built — sell these as **Books Complete / expanded scope**, never as already-done:

- Bank reconciliation.
- Cash-flow statement.
- Automated closing entries.
- Migration of historical books from existing accounting software.

If asked whether it replaces their accountant: it gives the accountant clean, tied-out books in the same system the work lives in. It does not file taxes.

## Pre-Call Setup

Have open:

- `docs/Blueprint Books Pitch Deck - Raves.pptx`
- `docs/raves-books-client-brief.md`
- `docs/raves-books-sow-draft.md`
- `docs/raves-usage-proof-snapshot-2026-06-09.md`
- `docs/raves-public-account-intel.md`
- `docs/raves-deal-tracker.md`
- the running Blueprint app, on the accounting page, with the trial balance and an A/R aging view ready to show.

Know before the call:

- who is on the call and whether an economic buyer is present,
- what Raves uses for books today (QuickBooks, spreadsheets, an outside bookkeeper),
- who owns the books at Raves (controller, office manager, owner, outside accountant),
- one or two usage proof points,
- whether opening balances could realistically come from a recent trial balance or QuickBooks export,
- whether you are ready to discuss price or should defer until the SOW.

## Call Objective

Say this early:

> "My goal is to leave with a decision on whether the books should live in Blueprint, who approves that, and where the opening numbers come from."

Do not let the meeting become a general accounting-feature brainstorm. Capture good ideas, then return to the decision.

## 30-Minute Agenda

### 0-3 Minutes: Frame The Call

Deck cue: Slide 1

Script:

> "Blueprint already carries the work — quotes, vendors, jobs. The money side still lives in spreadsheets and separate accounting software. Today I want to show what it looks like when the books live in the same place as the work, and decide whether that is the next phase worth funding."

Confirm:

- how much time they have,
- who owns the books today,
- whether deciding on the books direction is an acceptable goal for the call.

### 3-9 Minutes: Confirm The Money Path Already Runs Through Blueprint

Deck cue: Slides 2-3

Ask:

- "Walk me through how a job goes from won quote to invoice to paid today."
- "Where do vendor bills live before they get paid?"
- "When you want job profit, who pulls it and how long does it take?"

Use proof:

> "The quote log already has 536 records with about $9.3M marked open, and bills and POs are already coming in as task attachments. The information that should drive the books is already landing in Blueprint. Right now it gets re-keyed into spreadsheets and accounting software after the fact."

### 9-15 Minutes: Surface The Back-Office Friction

Deck cue: Slide 4

Ask:

- "How confident are you in job-level profit before a job closes?"
- "How do you track retainage on the jobs that hold it?"
- "How do you know who is slow to pay before it becomes a problem?"
- "What does month-end actually take right now?"

Listen for:

- profit-is-a-guess pain,
- A/R or collections pain,
- retainage tracked by hand,
- duplicate data entry between Blueprint and accounting software,
- a bookkeeper bottleneck or cost.

### 15-21 Minutes: Show It, Then Recommend Books Foundation

Deck cue: Slide 5

Show live, briefly:

- the trial balance tying out,
- A/R aging buckets,
- an invoice or bill PDF.

Then recommend:

> "Based on that, I recommend Blueprint Books Foundation. It tailors the construction chart of accounts to Raves, loads your opening balances, wires invoices and bills to A/R and A/P, gives you P&L and balance sheet on demand, and lets you close and lock a month — all in the tool the team already uses."

Tie it back to their words:

- If they said profit is late: emphasize job-cost accounts and on-demand P&L.
- If they said collections: emphasize A/R aging and invoice PDFs.
- If they said retainage: emphasize the retainage receivable/payable accounts.
- If they said double entry of data: emphasize one system, no re-keying.
- If they want bank reconciliation or to move historical books: that is **Books Complete**, not the foundation.

### 21-26 Minutes: Choose The Buying Path

Deck cue: Slide 6

Ask:

> "Should I write the SOW around Books Foundation, or do you need the expanded version with bank reconciliation and moving your existing history over?"

If they agree:

> "Great. Who needs to approve it, and who at Raves owns the books day to day?"

If they hesitate:

> "What would you need to see to trust the books in here — a parallel month, a sign-off from your accountant, something else?"

If they want price immediately:

> "Books Foundation is a $18,500 fixed fee: tailored chart of accounts, opening balances loaded, A/R and A/P wired up, statements, your first month-end close, and training. If you want bank reconciliation, a cash-flow statement, and your historical books migrated in, that is Books Complete at $28,000 with 30-day hypercare. The exact timeline depends on how clean the opening balances are."

Then ask:

> "Who reviews that SOW, and what decision date should we aim for?"

### 26-30 Minutes: Lock The Next Step

Deck cue: Slides 7-8

Do not end without these:

- selected package (Foundation or Complete),
- approval owner,
- SOW due date,
- decision date,
- the accounting owner at Raves,
- the opening-balance source (trial balance, QuickBooks export, accountant),
- next meeting or follow-up date.

Close:

> "I will send the one-page Books SOW by [date]. It will cover scope, the opening-balance checklist, timeline, and price. Who should I send it to for approval, and when should I check back?"

## Package Decision Guide

Use this live.

| If They Say... | Recommend | Why |
| --- | --- | --- |
| "Profit on jobs is always late" | Books Foundation | job-cost accounts plus on-demand P&L is the core fix |
| "We chase payments by memory" | Books Foundation | A/R aging and invoice PDFs are immediate wins |
| "We still want bank rec and to move QuickBooks history" | Books Complete | reconciliation and migration are the expanded scope |
| "We need it to match our accountant exactly" | Books Complete | migration plus a parallel month plus hypercare de-risks the switch |
| "We just want small monthly help after" | Books Care | monthly close-support lane after go-live |
| "Field access is the real problem" | Field Rollout first | books land better once daily trust exists; tee Books up next |

## Objection Responses

### "We already have QuickBooks."

> "Keep it if you want — many teams run Blueprint Books for job-costed operating books and hand a clean trial balance to their accountant. The win is that the books live where the work already is, so there is no re-keying and profit is current, not a month behind."

Next ask:

> "Who would feel that re-keying pain the most — you, the office, or your bookkeeper?"

### "Is it really accounting, or just reports?"

> "It is real double-entry: every invoice, bill, and payment posts a balanced journal entry, the trial balance ties to the penny, and you can lock a period when it is final. I can show the trial balance and a balance sheet live right now."

### "How do we trust it with our numbers?"

> "Two ways. We load opening balances from a known-good trial balance, and we can run a parallel month against your current books before you rely on it. That parallel month is part of the expanded Books Complete scope."

Next ask:

> "Would a clean parallel month be enough to switch, or does your accountant need to sign off too?"

### "Can we do it cheaper?"

> "Yes, by narrowing scope, not by doing the same work for less. The Foundation already excludes bank reconciliation and migration. If the opening balances are clean and you do data entry yourselves, we keep it at the $18,500 Foundation."

Next ask:

> "Which matters most first: job profit, A/R, or getting off spreadsheets at month-end?"

### "This can wait."

> "It can. The tradeoff is another quarter of re-keying and late profit numbers, plus the books drifting further from the work. My recommendation is to land it before the next busy season so the first close is calm."

Next ask:

> "What signal would tell you it is time — a bad month-end, a profit surprise, or a bookkeeping cost?"

## Notes To Capture

During the call, write down:

- what they use for books today,
- who owns the books,
- exact pain words,
- whether opening balances are clean,
- whether an accountant must sign off,
- approver name,
- must-have versus phase-two items,
- promised follow-up date.

## After-Call Actions

Within 2 hours:

1. Fill `docs/raves-post-call-follow-up-template.md`.
2. Update `docs/raves-deal-tracker.md` with the decision row: selected package, owner, next date.
3. Draft the follow-up email.

Within 24 hours:

1. Fill `docs/raves-books-sow-draft.md` with fee, terms, opening-balance source, and owners.
2. Send the SOW or the client brief, depending on the call outcome.
3. If they need an internal champion note, adapt `docs/raves-champion-approval-memo.md` for the Books ask.

## Follow-Up Email Template

Subject: Blueprint Books - follow-up

Hi [Name],

Thanks for walking through the books today.

We landed on [Books Foundation / Books Complete]. The outcome is [job-costed books in Blueprint with current profit, A/R, and A/P], and the main inputs we need are [accounting owner], [opening-balance source], and a chart-of-accounts review.

I will send the one-page Books SOW by [date]. For approval, I have [approval owner] as the next reviewer, with a target decision by [decision date].

Thanks,  
[Your Name]

## Success Standard

The call succeeds if it produces a dated next step owned by Raves, plus a named accounting owner and an opening-balance source.

The call does not succeed if it only produces:

- compliments on the demo,
- vague interest,
- a list of accounting features,
- "send me something" without owner or date,
- a promise to talk to the accountant with no follow-up date.
