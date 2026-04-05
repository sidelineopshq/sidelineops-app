'use server'

import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function updateProfile(firstName: string, lastName: string) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }

  const { error } = await svc()
    .from('users')
    .update({ first_name: firstName.trim(), last_name: lastName.trim() })
    .eq('id', user.id)

  if (error) {
    console.error('[updateProfile] users update error:', error)
    return { error: 'Failed to update profile. Please try again.' }
  }

  // Keep auth metadata in sync so displayName in nav updates on next load
  await supabase.auth.updateUser({
    data: { first_name: firstName.trim(), last_name: lastName.trim() },
  })

  return { success: true }
}

export async function updatePassword(newPassword: string) {
  const supabase = await createServerClient()
  const { error } = await supabase.auth.updateUser({ password: newPassword })
  if (error) return { error: error.message }
  return { success: true }
}
