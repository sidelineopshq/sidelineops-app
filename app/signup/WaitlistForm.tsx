'use client'

import { useState } from 'react'
import { joinWaitlist } from './actions'

const inputClass =
  'w-full px-4 py-2 rounded-lg bg-gray-800 text-white border border-gray-700 focus:outline-none focus:border-sky-500 placeholder-gray-500 text-sm'

export default function WaitlistForm() {
  const [email,   setEmail]   = useState('')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)
  const [done,    setDone]    = useState(false)

  async function handleSubmit() {
    setError(null)
    setLoading(true)
    const result = await joinWaitlist(email)
    setLoading(false)
    if (result.error) {
      setError(result.error)
    } else {
      setDone(true)
    }
  }

  if (done) {
    return (
      <div className="rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-4 text-sm text-green-400 text-center">
        You&apos;re on the list! We&apos;ll notify you when SidelineOps launches.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <input
        type="email"
        placeholder="Your email address"
        value={email}
        onChange={e => setEmail(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && handleSubmit()}
        className={inputClass}
      />
      {error && <p className="text-red-400 text-sm">{error}</p>}
      <button
        onClick={handleSubmit}
        disabled={loading}
        className="w-full py-2.5 bg-sky-600 hover:bg-sky-500 text-white font-semibold rounded-lg disabled:opacity-50 transition-colors text-sm"
      >
        {loading ? 'Submitting...' : 'Notify Me'}
      </button>
    </div>
  )
}
