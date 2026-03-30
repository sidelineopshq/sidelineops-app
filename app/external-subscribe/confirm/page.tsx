import { createClient } from '@supabase/supabase-js'
import { notFound }     from 'next/navigation'

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

async function confirmSubscription(token: string) {
  const svc = createServiceClient()
  const { error } = await svc
    .from('external_subscribers')
    .update({ opted_in_at: new Date().toISOString() })
    .eq('token', token)
    .is('opted_in_at', null)
    .eq('is_active', true)
  return error
}

export default async function ConfirmSubscriptionPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const { token } = await searchParams
  if (!token) notFound()

  const svc = createServiceClient()

  // Look up subscriber
  const { data: sub } = await svc
    .from('external_subscribers')
    .select('id, name, opted_in_at, unsubscribed_at, is_active, token, programs(name)')
    .eq('token', token)
    .maybeSingle()

  if (!sub || !sub.is_active) notFound()

  const programName   = (sub as any).programs?.name ?? 'SidelineOps'
  const appUrl        = process.env.BASE_URL ?? 'https://sidelineopshq.com'
  const unsubscribeUrl = `${appUrl}/external-subscribe/unsubscribe?token=${token}`

  const alreadyConfirmed   = !!sub.opted_in_at && !sub.unsubscribed_at
  const alreadyUnsubscribed = !!sub.unsubscribed_at

  // Auto-confirm on page load if not yet confirmed
  let confirmed = alreadyConfirmed
  if (!alreadyConfirmed && !alreadyUnsubscribed) {
    const err = await confirmSubscription(token)
    confirmed = !err
  }

  return (
    <main className="min-h-screen bg-slate-950 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="rounded-2xl border border-white/10 bg-slate-900 overflow-hidden">
          <div className="h-1.5 bg-sky-500" />
          <div className="px-8 py-8 space-y-4">

            {alreadyUnsubscribed ? (
              <>
                <h1 className="text-xl font-bold text-white">Already Unsubscribed</h1>
                <p className="text-slate-400 text-sm">
                  You&apos;ve previously unsubscribed from schedule notifications for <strong className="text-white">{programName}</strong>.
                  Contact your program coordinator if you&apos;d like to resubscribe.
                </p>
              </>
            ) : alreadyConfirmed ? (
              <>
                <div className="flex items-center gap-2">
                  <span className="text-2xl">✓</span>
                  <h1 className="text-xl font-bold text-white">Already Confirmed</h1>
                </div>
                <p className="text-slate-400 text-sm">
                  You&apos;re already subscribed to schedule notifications from <strong className="text-white">{programName}</strong>.
                </p>
                <p className="text-xs text-slate-500 pt-2">
                  <a href={unsubscribeUrl} className="underline hover:text-slate-400 transition-colors">Unsubscribe</a>
                </p>
              </>
            ) : confirmed ? (
              <>
                <div className="flex items-center gap-2">
                  <span className="text-2xl">✓</span>
                  <h1 className="text-xl font-bold text-white">You&apos;re Subscribed</h1>
                </div>
                <p className="text-slate-400 text-sm">
                  Hi <strong className="text-white">{sub.name}</strong>, you&apos;ll now receive schedule change alerts from{' '}
                  <strong className="text-white">{programName}</strong>.
                </p>
                <p className="text-xs text-slate-500 pt-2">
                  <a href={unsubscribeUrl} className="underline hover:text-slate-400 transition-colors">Unsubscribe at any time</a>
                </p>
              </>
            ) : (
              <>
                <h1 className="text-xl font-bold text-white">Something went wrong</h1>
                <p className="text-slate-400 text-sm">Unable to confirm your subscription. Please try again or contact support.</p>
              </>
            )}

          </div>
        </div>
      </div>
    </main>
  )
}
