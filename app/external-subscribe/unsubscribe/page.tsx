import { createClient } from '@supabase/supabase-js'
import { notFound }     from 'next/navigation'

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export default async function ExternalUnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const { token } = await searchParams
  if (!token) notFound()

  const svc = createServiceClient()

  const { data: sub } = await svc
    .from('external_subscribers')
    .select('id, name, unsubscribed_at, is_active, programs(name)')
    .eq('token', token)
    .maybeSingle()

  if (!sub || !sub.is_active) notFound()

  const programName       = (sub as any).programs?.name ?? 'SidelineOps'
  const alreadyUnsubscribed = !!sub.unsubscribed_at

  if (!alreadyUnsubscribed) {
    await svc
      .from('external_subscribers')
      .update({ unsubscribed_at: new Date().toISOString() })
      .eq('token', token)
  }

  return (
    <main className="min-h-screen bg-slate-950 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="rounded-2xl border border-white/10 bg-slate-900 overflow-hidden">
          <div className="h-1.5 bg-slate-600" />
          <div className="px-8 py-8 space-y-4">
            <h1 className="text-xl font-bold text-white">Unsubscribed</h1>
            <p className="text-slate-400 text-sm">
              {alreadyUnsubscribed
                ? `You were already unsubscribed from schedule notifications from ${programName}.`
                : `Hi ${sub.name}, you've been unsubscribed from schedule notifications from ${programName}. You won't receive any further alerts.`
              }
            </p>
            <p className="text-xs text-slate-500 pt-2">
              If this was a mistake, contact your program coordinator to be re-invited.
            </p>
          </div>
        </div>
      </div>
    </main>
  )
}
