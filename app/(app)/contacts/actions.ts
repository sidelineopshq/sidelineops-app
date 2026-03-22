'use server'

import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function updateContact(contactId: string, formData: {
  first_name: string
  last_name: string
  email?: string
  contact_type: string
  player_id?: string | null
  team_id: string
}) {
  const authClient = await createServerClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) redirect('/login')

  const { data: teamUser } = await authClient
    .from('team_users')
    .select('can_manage_contacts')
    .eq('user_id', user.id)
    .eq('team_id', formData.team_id)
    .single()

  if (!teamUser?.can_manage_contacts) {
    return { error: 'You do not have permission to edit contacts.' }
  }

  const supabase = createServiceClient()

  const { error } = await supabase
    .from('contacts')
    .update({
      first_name:   formData.first_name.trim(),
      last_name:    formData.last_name.trim(),
      email:        formData.email?.trim() || null,
      contact_type: formData.contact_type,
      player_id:    formData.player_id || null,
    })
    .eq('id', contactId)

  if (error) {
    console.error('Update contact error:', error)
    return { error: 'Failed to update contact.' }
  }

  return { success: true }
}

export async function deleteContact(contactId: string, teamId: string) {
  const authClient = await createServerClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) redirect('/login')

  const { data: teamUser } = await authClient
    .from('team_users')
    .select('can_manage_contacts')
    .eq('user_id', user.id)
    .eq('team_id', teamId)
    .single()

  if (!teamUser?.can_manage_contacts) {
    return { error: 'You do not have permission to delete contacts.' }
  }

  // Soft delete
  const supabase = createServiceClient()

  const { error } = await supabase
    .from('contacts')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', contactId)

  if (error) {
    return { error: 'Failed to remove contact.' }
  }

  return { success: true }
}