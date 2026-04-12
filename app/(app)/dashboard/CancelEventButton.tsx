'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { cancelEvent } from '@/app/(app)/schedule/actions'

interface Props {
  eventId:    string
  eventLabel: string  // e.g. "vs Rival HS" or "Practice"
  eventDate:  string  // already formatted, e.g. "Apr 14"
}

export default function CancelEventButton({ eventId, eventLabel, eventDate }: Props) {
  const router            = useRouter()
  const [open, setOpen]   = useState(false)
  const [busy, setBusy]   = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  async function handleConfirm() {
    setBusy(true)
    const result = await cancelEvent(eventId)
    setBusy(false)
    setOpen(false)
    if (result?.error) {
      setToast(result.error)
    } else {
      setToast('Event cancelled')
      router.refresh()
    }
    setTimeout(() => setToast(null), 3500)
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="mt-2 w-full rounded-lg border border-red-500 text-red-400 px-3 py-1.5 text-sm font-semibold text-center hover:bg-red-500/10 transition-colors"
      >
        Cancel Event
      </button>

      {/* Confirmation dialog */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-xl">
            <h2 className="text-base font-bold text-white mb-2">Cancel event?</h2>
            <p className="text-sm text-slate-300 leading-relaxed mb-5">
              Cancel <span className="text-white font-semibold">{eventLabel}</span> on{' '}
              <span className="text-white font-semibold">{eventDate}</span>?
              <br />
              <span className="text-slate-400">
                This will notify all contacts that the event has been cancelled.
              </span>
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setOpen(false)}
                disabled={busy}
                className="flex-1 rounded-lg border border-white/10 px-4 py-2 text-sm font-semibold text-slate-300 hover:bg-slate-800 transition-colors disabled:opacity-50"
              >
                Keep Event
              </button>
              <button
                onClick={handleConfirm}
                disabled={busy}
                className="flex-1 rounded-lg bg-red-600 hover:bg-red-500 px-4 py-2 text-sm font-semibold text-white transition-colors disabled:opacity-50"
              >
                {busy ? 'Cancelling…' : 'Cancel Event'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 rounded-xl bg-slate-800 border border-white/10 px-4 py-2.5 text-sm font-medium text-white shadow-lg">
          {toast}
        </div>
      )}
    </>
  )
}
