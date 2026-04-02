import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import OnboardingWizard from './OnboardingWizard'

export const metadata = { title: 'Get Started — SidelineOps' }

export default async function OnboardingPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // If user already completed onboarding (has team_users rows), send to dashboard
  const { data: teamUsers } = await supabase
    .from('team_users')
    .select('id')
    .eq('user_id', user.id)
    .limit(1)

  if (teamUsers && teamUsers.length > 0) redirect('/dashboard')

  return <OnboardingWizard />
}
