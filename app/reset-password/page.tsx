'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function ResetPasswordPage() {
  const router   = useRouter()
  const supabase = createClient()

  const [password,  setPassword]  = useState('')
  const [confirm,   setConfirm]   = useState('')
  const [error,     setError]     = useState<string | null>(null)
  const [success,   setSuccess]   = useState(false)
  const [loading,   setLoading]   = useState(false)
  const [ready,     setReady]     = useState(false)

  // Supabase exchanges the token in the URL hash and establishes a session.
  // Listen for the PASSWORD_RECOVERY event before showing the form.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setReady(true)
      }
    })
    return () => subscription.unsubscribe()
  }, [supabase])

  async function handleReset() {
    setError(null)

    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)
    const { error: updateError } = await supabase.auth.updateUser({ password })
    setLoading(false)

    if (updateError) {
      setError(updateError.message)
      return
    }

    setSuccess(true)
    setTimeout(() => router.push('/dashboard'), 2000)
  }

  const inputClass = "w-full px-4 py-2 rounded-lg bg-gray-800 text-white border border-gray-700 focus:outline-none focus:border-green-500"

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950">
      <div className="bg-gray-900 p-8 rounded-xl shadow-lg w-full max-w-sm">
        <h1 className="text-2xl font-bold text-white mb-2">New Password</h1>
        <p className="text-gray-400 text-sm mb-6">Choose a new password for your account.</p>

        {success ? (
          <div className="rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-4 text-sm text-green-400">
            Password updated successfully. Redirecting…
          </div>
        ) : !ready ? (
          <div className="text-gray-400 text-sm text-center py-6">
            Verifying your reset link…
          </div>
        ) : (
          <div className="space-y-4">
            <input
              type="password"
              placeholder="New password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className={inputClass}
              autoComplete="new-password"
            />
            <input
              type="password"
              placeholder="Confirm new password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleReset()}
              className={inputClass}
              autoComplete="new-password"
            />

            {error && <p className="text-red-400 text-sm">{error}</p>}

            <button
              onClick={handleReset}
              disabled={loading}
              className="w-full py-2 bg-green-600 hover:bg-green-500 text-white font-semibold rounded-lg disabled:opacity-50"
            >
              {loading ? 'Updating…' : 'Reset Password'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
