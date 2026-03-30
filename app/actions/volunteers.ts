'use server'

import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

async function assertProgramManageAccess(userId: string, programId: string): Promise<boolean> {
  const authClient = await createServerClient()
  const { data: teams } = await authClient
    .from('teams')
    .select('id')
    .eq('program_id', programId)
  const teamIds = (teams ?? []).map(t => t.id)
  if (teamIds.length === 0) return false
  const { data: teamUsers } = await authClient
    .from('team_users')
    .select('can_manage_events')
    .eq('user_id', userId)
    .in('team_id', teamIds)
  return teamUsers?.some(t => t.can_manage_events) ?? false
}

// ── Template slot actions ─────────────────────────────────────────────────────

export async function createTemplateSlot(
  programId: string,
  data: {
    role_id:     string
    slot_count:  number
    start_time?: string
    end_time?:   string
    notes?:      string
  },
) {
  const authClient = await createServerClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return { error: 'Not authenticated' }
  if (!(await assertProgramManageAccess(user.id, programId))) return { error: 'Not authorized' }

  const service = createServiceClient()
  const { error } = await service
    .from('volunteer_slot_templates')
    .insert({
      program_id:        programId,
      volunteer_role_id: data.role_id,
      slot_count:        data.slot_count,
      start_time:        data.start_time || null,
      end_time:          data.end_time   || null,
      notes:             data.notes      || null,
      is_active:         true,
    })

  if (error) return { error: error.message }
  revalidatePath('/settings/team')
  return { success: true }
}

export async function updateTemplateSlot(
  slotId: string,
  data: {
    role_id:     string
    slot_count:  number
    start_time?: string
    end_time?:   string
    notes?:      string
  },
) {
  const authClient = await createServerClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const service = createServiceClient()
  const { data: row } = await service
    .from('volunteer_slot_templates')
    .select('program_id')
    .eq('id', slotId)
    .single()
  if (!row) return { error: 'Template slot not found' }
  if (!(await assertProgramManageAccess(user.id, row.program_id))) return { error: 'Not authorized' }

  const { error } = await service
    .from('volunteer_slot_templates')
    .update({
      volunteer_role_id: data.role_id,
      slot_count:        data.slot_count,
      start_time:        data.start_time || null,
      end_time:          data.end_time   || null,
      notes:             data.notes      || null,
    })
    .eq('id', slotId)

  if (error) return { error: error.message }
  revalidatePath('/settings/team')
  return { success: true }
}

export async function removeTemplateSlot(slotId: string) {
  const authClient = await createServerClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const service = createServiceClient()
  const { data: row } = await service
    .from('volunteer_slot_templates')
    .select('program_id')
    .eq('id', slotId)
    .single()
  if (!row) return { error: 'Template slot not found' }
  if (!(await assertProgramManageAccess(user.id, row.program_id))) return { error: 'Not authorized' }

  const { error } = await service
    .from('volunteer_slot_templates')
    .update({ is_active: false })
    .eq('id', slotId)

  if (error) return { error: error.message }
  revalidatePath('/settings/team')
  return { success: true }
}
