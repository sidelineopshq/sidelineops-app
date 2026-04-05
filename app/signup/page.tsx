import { createClient } from '@supabase/supabase-js'
import SignupForm from './SignupForm'
import WaitlistForm from './WaitlistForm'

export const metadata = { title: 'Sign Up — SidelineOps' }

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

async function validateCode(code: string): Promise<boolean> {
  if (!code) return false
  const supabase = serviceClient()
  const { data } = await supabase
    .from('access_codes')
    .select('id, is_active, expires_at, max_uses, use_count')
    .eq('code', code)
    .maybeSingle()

  if (!data || !data.is_active) return false
  if (data.expires_at && new Date(data.expires_at) < new Date()) return false
  if (data.max_uses != null && data.use_count >= data.max_uses) return false
  return true
}

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>
}) {
  const { code = '' } = await searchParams
  const codeValid = await validateCode(code)

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950 px-4">
      <div className="bg-gray-900 p-8 rounded-xl shadow-lg w-full max-w-md">

        {/* Logo */}
        <div className="mb-6">
          <p className="text-xs font-bold tracking-widest uppercase text-gray-500 mb-1">
            SidelineOps
          </p>
          <div className="h-px bg-gray-800" />
        </div>

        {codeValid ? (
          <SignupForm code={code} />
        ) : (
          /* Coming Soon / Waitlist */
          <div>
            <h1 className="text-2xl font-bold text-white mb-2">Early Access</h1>
            <p className="text-gray-400 text-sm mb-2">
              SidelineOps is currently in early access.
            </p>
            <p className="text-gray-400 text-sm mb-6">
              Request access to be notified when we launch.
            </p>

            <WaitlistForm />

            <p className="text-center text-sm mt-6">
              <a href="/login" className="text-gray-400 hover:text-gray-200 transition-colors">
                Already have an account? Sign in →
              </a>
            </p>

            <p className="text-center text-xs text-gray-600 mt-2">
              By continuing you agree to our{' '}
              <a href="/legal/terms" className="hover:text-gray-400 underline transition-colors">Terms of Service</a>
              {' '}and{' '}
              <a href="/legal/privacy" className="hover:text-gray-400 underline transition-colors">Privacy Policy</a>
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
