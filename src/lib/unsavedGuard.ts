// Ask before leaving a dirty draft form. Call during component init — it
// registers a beforeNavigate hook. In-app navigation gets the designed
// ConfirmDialog; tab close/refresh (nav.type === 'leave') gets the browser's
// own prompt, the only thing allowed to block it. After a successful post,
// call disarm() before goto so the redirect isn't challenged.
//
//   const guard = guardUnsaved(() => dirty)
//   …
//   guard.disarm()
//   await goto(`/accounting/invoices/${inv._id}`)
import { beforeNavigate, goto } from '$app/navigation'
import { confirmDialog } from '$lib/confirm.svelte'

export function guardUnsaved(isDirty: () => boolean): { disarm: () => void } {
  let armed = true

  beforeNavigate((nav) => {
    if (!armed || !isDirty()) return
    if (nav.type === 'leave') {
      nav.cancel()
      return
    }
    const to = nav.to?.url.href
    nav.cancel()
    if (!to) return
    void confirmDialog({
      title: 'Discard this draft?',
      body: 'Nothing has been posted — what you’ve entered here will be lost.',
      confirmLabel: 'Discard draft',
      cancelLabel: 'Keep editing',
      danger: true,
    }).then((ok) => {
      if (ok) {
        armed = false
        void goto(to)
      }
    })
  })

  return { disarm: () => (armed = false) }
}
