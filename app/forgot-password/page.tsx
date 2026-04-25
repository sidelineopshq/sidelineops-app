'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function ForgotPasswordPage() {
  const supabase    = createClient()
  const searchParams = useSearchParams()
  const linkExpired  = searchParams.get('error') === 'link_expired'

  const [email,   setEmail]   = useState('')
  const [sent,    setSent]    = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit() {
    if (!email.trim()) return
    setLoading(true)

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? window.location.origin
    await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${baseUrl}/auth/callback?next=/reset-password`,
    })

    // Always show success — don't reveal whether email exists
    setSent(true)
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950">
      <div className="bg-gray-900 p-8 rounded-xl shadow-lg w-full max-w-sm">
        <h1 className="text-2xl font-bold text-white mb-2">Reset Password</h1>
        <p className="text-gray-400 text-sm mb-6">
          Enter your email and we&apos;ll send you a reset link.
        </p>

        {linkExpired && !sent && (
          <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
            That reset link has expired or was opened in a different browser.
            Enter your email below to request a new one.
          </div>
        )}

        {sent ? (
          <div className="rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-4 text-sm text-green-400">
            If an account exists for that email, you&apos;ll receive a reset link shortly.
          </div>
        ) : (
          <div className="space-y-4">
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              className="w-full px-4 py-2 rounded-lg bg-gray-800 text-white border border-gray-700 focus:outline-none focus:border-green-500"
            />

            <button
              onClick={handleSubmit}
              disabled={loading}
              className="w-full py-2 bg-green-600 hover:bg-green-500 text-white font-semibold rounded-lg disabled:opacity-50"
            >
              {loading ? 'Sending...' : 'Send Reset Link'}
            </button>
          </div>
        )}

        <p className="text-center text-sm mt-6">
          <a href="/login" className="text-gray-400 hover:text-gray-200 transition-colors">
            ← Back to Sign In
          </a>
        </p>
      </div>
    </div>
  )
}
