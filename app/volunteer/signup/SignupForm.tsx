'use client'

import { useState, useTransition } from 'react'
import { publicSignup } from './actions'

export default function SignupForm({ token }: { token: string }) {
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName]   = useState('')
  const [email, setEmail]         = useState('')
  const [error, setError]         = useState<string | null>(null)
  const [done, setDone]           = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!firstName.trim()) {
      setError('First name is required.')
      return
    }
    startTransition(async () => {
      const result = await publicSignup(token, {
        first_name: firstName.trim(),
        last_name:  lastName.trim() || undefined,
        email:      email.trim()    || undefined,
      })
      if (result?.error) {
        setError(result.error)
      } else {
        setDone(true)
      }
    })
  }

  if (done) {
    return (
      <div className="rounded-2xl border border-green-500/30 bg-green-500/10 p-6 text-center">
        <p className="text-lg font-bold text-green-400 mb-1">You're signed up!</p>
        <p className="text-sm text-slate-400">
          {email.trim() ? "A confirmation email has been sent to " + email.trim() + "." : "You've been added as a volunteer."}
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-slate-400 mb-1">
            First Name <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={firstName}
            onChange={e => setFirstName(e.target.value)}
            placeholder="Jane"
            required
            className="w-full rounded-xl border border-white/10 bg-slate-800 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-sky-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-400 mb-1">Last Name</label>
          <input
            type="text"
            value={lastName}
            onChange={e => setLastName(e.target.value)}
            placeholder="Smith"
            className="w-full rounded-xl border border-white/10 bg-slate-800 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-sky-500 focus:outline-none"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-400 mb-1">
          Email <span className="text-slate-500 font-normal">(optional — for confirmation)</span>
        </label>
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="jane@example.com"
          className="w-full rounded-xl border border-white/10 bg-slate-800 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-sky-500 focus:outline-none"
        />
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-50 px-4 py-3 text-sm font-semibold transition-colors"
      >
        {isPending ? 'Signing up...' : 'Sign Up to Volunteer'}
      </button>
    </form>
  )
}
