'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, usePathname } from 'next/navigation'

export default function ReportProblemModal() {
  const [open, setOpen]           = useState(false)
  const [description, setDescription] = useState('')
  const [sending, setSending]     = useState(false)
  const [sent, setSent]           = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const router      = useRouter()
  const pathname    = usePathname()

  // Open when ?feedback=true is in the URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('feedback') === 'true') {
      setOpen(true)
      setDescription('')
      setSent(false)
      setError(null)
    }
  }, [pathname])

  // Focus textarea when modal opens
  useEffect(() => {
    if (open) textareaRef.current?.focus()
  }, [open])

  function closeModal() {
    // Remove ?feedback=true from URL without adding to history
    const url = new URL(window.location.href)
    url.searchParams.delete('feedback')
    router.replace(url.pathname + (url.search || ''))
    setOpen(false)
    setDescription('')
    setSent(false)
    setError(null)
  }

  async function handleSubmit() {
    if (!description.trim()) return
    setSending(true)
    setError(null)
    try {
      const res = await fetch('/api/feedback', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          description: description.trim(),
          pageUrl:     window.location.href,
        }),
      })
      if (!res.ok) throw new Error('Failed to send')
      setSent(true)
      setTimeout(closeModal, 2000)
    } catch {
      setError('Failed to send. Please try again.')
    } finally {
      setSending(false)
    }
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
      onClick={e => { if (e.target === e.currentTarget) closeModal() }}
    >
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-900 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <h2 className="text-sm font-semibold text-white">Report a Problem</h2>
          <button
            onClick={closeModal}
            className="text-slate-400 hover:text-white transition-colors text-lg leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5">
          {sent ? (
            <div className="rounded-xl bg-green-500/15 border border-green-500/30 px-4 py-3 text-sm text-green-400 text-center">
              Thanks — your report was sent.
            </div>
          ) : (
            <>
              <p className="text-xs text-slate-400 mb-3">
                Describe what went wrong. We'll also include the current page URL.
              </p>
              <textarea
                ref={textareaRef}
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="e.g. The save button doesn't respond when I click it..."
                rows={4}
                className="w-full rounded-xl border border-white/10 bg-slate-800 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-sky-500 focus:outline-none resize-none"
              />
              {error && (
                <p className="mt-2 text-xs text-red-400">{error}</p>
              )}
              <div className="mt-4 flex items-center justify-end gap-3">
                <button
                  onClick={closeModal}
                  className="rounded-xl px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={sending || !description.trim()}
                  className="rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-50 px-5 py-2 text-sm font-semibold transition-colors"
                >
                  {sending ? 'Sending...' : 'Send Report'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
