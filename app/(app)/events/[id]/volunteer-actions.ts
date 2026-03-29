'use server'

import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { revalidatePath } from 'next/cache'
import { buildVolunteerConfirmationEmail } from '@/lib/email/volunteerConfirmation'

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

/** Verify the calling user has can_manage_events for this event. Returns true if authorized. */
async function assertEventAccess(userId: string, eventId: string): Promise<boolean> {
  const authClient = await createServerClient()
  const { data: eventTeams } = await authClient
    .from('event_team_details')
    .select('team_id')
    .eq('event_id', eventId)

  const teamIds = (eventTeams ?? []).map(t => t.team_id)
  if (teamIds.length === 0) return false

  const { data: teamUsers } = await authClient
    .from('team_users')
    .select('can_manage_events')
    .eq('user_id', userId)
    .in('team_id', teamIds)

  return teamUsers?.some(t => t.can_manage_events) ?? false
}

export async function assignVolunteer(
  slotId:      string,
  eventId:     string,
  programName: string,
  data: {
    contact_id?: string
    first_name:  string
    last_name?:  string
    email?:      string
  },
  meta: {
    role_name:   string
    event_label: string
    event_date:  string
  },
) {
  const authClient = await createServerClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return { error: 'Not authenticated' }
  if (!(await assertEventAccess(user.id, eventId))) return { error: 'Not authorized' }

  const trimmedName = data.first_name.trim()
  if (!trimmedName) return { error: 'Name is required' }

  const service = createServiceClient()

  const { data: assignment, error: insertError } = await service
    .from('volunteer_assignments')
    .insert({
      slot_id:       slotId,
      contact_id:    data.contact_id || null,
      first_name:    trimmedName,
      last_name:     data.last_name?.trim()  || null,
      email:         data.email?.trim()       || null,
      signup_source: 'coach',
      status:        'assigned',
    })
    .select('id, first_name, last_name, email, signup_source, status, contact_id')
    .single()

  if (insertError) return { error: insertError.message }

  // Send confirmation email (non-blocking)
  if (data.email?.trim()) {
    try {
      const resend = new Resend(process.env.RESEND_API_KEY)
      await resend.emails.send({
        from:    `${programName} via SidelineOps <${process.env.NEXT_PUBLIC_FROM_EMAIL}>`,
        to:      data.email.trim(),
        subject: `Volunteer Confirmation: ${meta.role_name} — ${meta.event_label}`,
        html:    buildVolunteerConfirmationEmail({
          volunteerName: trimmedName,
          roleName:      meta.role_name,
          eventLabel:    meta.event_label,
          eventDate:     meta.event_date,
          programName,
        }),
      })
    } catch (err) {
      console.error('[assignVolunteer] email failed:', err)
    }
  }

  revalidatePath(`/events/${eventId}`)
  return { success: true, assignment }
}

export async function unassignVolunteer(assignmentId: string, eventId: string) {
  const authClient = await createServerClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return { error: 'Not authenticated' }
  if (!(await assertEventAccess(user.id, eventId))) return { error: 'Not authorized' }

  const service = createServiceClient()
  const { error } = await service
    .from('volunteer_assignments')
    .delete()
    .eq('id', assignmentId)

  if (error) return { error: error.message }

  revalidatePath(`/events/${eventId}`)
  return { success: true }
}
