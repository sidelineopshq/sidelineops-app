'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { createAccount } from './actions'

const inputClass =
  'w-full px-4 py-2 rounded-lg bg-gray-800 text-white border border-gray-700 focus:outline-none focus:border-sky-500 placeholder-gray-500 text-sm'

export default function SignupForm({ code }: { code: string }) {
  const [firstName,       setFirstName]       = useState('')
  const [lastName,        setLastName]        = useState('')
  const [email,           setEmail]           = useState('')
  const [password,        setPassword]        = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error,           setError]           = useState<string | null>(null)
  const [loading,         setLoading]         = useState(false)
  const [done,            setDone]            = useState(false)
  const [resent,          setResent]          = useState(false)
  const [resending,       setResending]       = useState(false)

  async function handleSubmit() {
    setError(null)

    if (!firstName.trim() || !lastName.trim() || !email.trim() || !password) {
      setError('All fields are required.')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)
    const result = await createAccount({
      code,
      firstName: firstName.trim(),
      lastName:  lastName.trim(),
      email:     email.trim(),
      password,
    })
    setLoading(false)

    if (result.error) {
      setError(result.error)
    } else {
      setDone(true)
    }
  }

  async function handleResend() {
    setResending(true)
    const supabase = createClient()
    await supabase.auth.resend({ type: 'signup', email })
    setResending(false)
    setResent(true)
  }

  if (done) {
    return (
      <div className="text-center space-y-4">
        <div className="text-5xl">✉️</div>
        <h2 className="text-xl font-bold text-white">Check your email</h2>
        <p className="text-gray-400 text-sm">
          We sent a verification link to{' '}
          <span className="text-white font-medium">{email}</span>
        </p>
        <p className="text-gray-400 text-sm">
          Click the link in the email to verify your account and complete setup.
        </p>
        <p className="text-gray-500 text-xs">
          Didn&apos;t receive it? Check your spam folder.
        </p>
        {resent ? (
          <p className="text-green-400 text-sm">Verification email resent.</p>
        ) : (
          <button
            onClick={handleResend}
            disabled={resending}
            className="mt-2 text-sm text-sky-400 hover:text-sky-300 disabled:opacity-50 transition-colors"
          >
            {resending ? 'Sending...' : 'Resend Email'}
          </button>
        )}
      </div>
    )
  }

  return (
    <>
      <h1 className="text-2xl font-bold text-white mb-1">Create your account</h1>
      <p className="text-gray-400 text-sm mb-6">
        You&apos;ve been invited to join the early access program.
      </p>

      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <input
            type="text"
            placeholder="First Name"
            value={firstName}
            onChange={e => setFirstName(e.target.value)}
            className={inputClass}
          />
          <input
            type="text"
            placeholder="Last Name"
            value={lastName}
            onChange={e => setLastName(e.target.value)}
            className={inputClass}
          />
        </div>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          className={inputClass}
        />
        <input
          type="password"
          placeholder="Password (min 8 characters)"
          value={password}
          onChange={e => setPassword(e.target.value)}
          className={inputClass}
        />
        <input
          type="password"
          placeholder="Confirm Password"
          value={confirmPassword}
          onChange={e => setConfirmPassword(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSubmit()}
          className={inputClass}
        />

        {error && (
          <p className="text-red-400 text-sm">{error}</p>
        )}

        <button
          onClick={handleSubmit}
          disabled={loading}
          className="w-full py-2.5 bg-sky-600 hover:bg-sky-500 text-white font-semibold rounded-lg disabled:opacity-50 transition-colors text-sm"
        >
          {loading ? 'Creating account...' : 'Create Account'}
        </button>
      </div>

      <p className="text-center text-sm mt-6">
        <a href="/login" className="text-gray-400 hover:text-gray-200 transition-colors">
          Already have an account? Sign in →
        </a>
      </p>
    </>
  )
}
