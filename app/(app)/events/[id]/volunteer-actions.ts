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
    volunteer_name:  string
    volunteer_email?: string
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

  const trimmedName = data.volunteer_name.trim()
  if (!trimmedName) return { error: 'Name is required' }

  const service = createServiceClient()

  const { data: assignment, error: insertError } = await service
    .from('volunteer_assignments')
    .insert({
      event_volunteer_slot_id: slotId,
      contact_id:              data.contact_id || null,
      volunteer_name:          trimmedName,
      volunteer_email:         data.volunteer_email?.trim() || null,
      signup_source:           'coach',
      status:                  'assigned',
    })
    .select('id, volunteer_name, volunteer_email, signup_source, status, contact_id')
    .single()

  if (insertError) return { error: insertError.message }

  // Send confirmation email (non-blocking)
  if (data.volunteer_email?.trim()) {
    try {
      const resend = new Resend(process.env.RESEND_API_KEY)
      await resend.emails.send({
        from:    `${programName} via SidelineOps <${process.env.NEXT_PUBLIC_FROM_EMAIL}>`,
        to:      data.volunteer_email.trim(),
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

  // Fetch assignment details for cancellation email
  const { data: assignment } = await service
    .from('volunteer_assignments')
    .select(`
      id, volunteer_name, volunteer_email,
      event_volunteer_slots!inner(
        volunteer_role_id,
        volunteer_roles!volunteer_role_id(name),
        events!inner(event_date, program_id, programs!inner(name))
      )
    `)
    .eq('id', assignmentId)
    .single()

  const { error } = await service
    .from('volunteer_assignments')
    .delete()
    .eq('id', assignmentId)

  if (error) return { error: error.message }

  // Send cancellation email (non-blocking)
  if (assignment?.volunteer_email) {
    try {
      const slot    = (assignment as any).event_volunteer_slots as any
      const roleName    = slot?.volunteer_roles?.name ?? 'volunteer'
      const eventDate   = slot?.events?.event_date ?? ''
      const programName = slot?.events?.programs?.name ?? ''
      const formattedDate = eventDate
        ? new Date(eventDate + 'T00:00:00').toLocaleDateString('en-US', {
            weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
          })
        : ''

      const resend = new Resend(process.env.RESEND_API_KEY)
      await resend.emails.send({
        from:    `${programName} via SidelineOps <${process.env.NEXT_PUBLIC_FROM_EMAIL}>`,
        to:      assignment.volunteer_email,
        subject: `Volunteer update — ${formattedDate}`,
        html: `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;padding:40px 16px">
<tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px">
<tr><td style="background:#1e293b;border-radius:16px;padding:32px">
<p style="color:#94a3b8;font-size:13px;margin:0 0 8px">${programName}</p>
<h2 style="color:#f1f5f9;font-size:20px;margin:0 0 16px">Volunteer Update</h2>
<p style="color:#cbd5e1;font-size:15px;margin:0 0 16px">
  Hi ${assignment.volunteer_name},
</p>
<p style="color:#cbd5e1;font-size:15px;margin:0 0 16px">
  You've been removed from the <strong style="color:#f1f5f9">${roleName}</strong> volunteer slot for <strong style="color:#f1f5f9">${formattedDate}</strong>.
</p>
<p style="color:#94a3b8;font-size:13px;margin:24px 0 0">
  If you have questions, please contact your program coordinator.
</p>
</td></tr>
</table>
</td></tr>
</table>
</body></html>`,
      })
    } catch (err) {
      console.error('[unassignVolunteer] cancellation email failed:', err)
    }
  }

  revalidatePath(`/events/${eventId}`)
  return { success: true }
}

export async function deleteVolunteerSlot(slotId: string, eventId: string) {
  const authClient = await createServerClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return { error: 'Not authenticated' }
  if (!(await assertEventAccess(user.id, eventId))) return { error: 'Not authorized' }

  const service = createServiceClient()

  // Verify no active assignments
  const { count } = await service
    .from('volunteer_assignments')
    .select('id', { count: 'exact', head: true })
    .eq('event_volunteer_slot_id', slotId)
    .neq('status', 'cancelled')

  if ((count ?? 0) > 0) return { error: 'Slot has active assignments. Use deleteSlotWithAssignments.' }

  const { error } = await service
    .from('event_volunteer_slots')
    .delete()
    .eq('id', slotId)

  if (error) return { error: error.message }

  revalidatePath(`/events/${eventId}`)
  return { success: true }
}

export async function deleteSlotWithAssignments(
  slotId: string,
  eventId: string,
  programName: string,
) {
  const authClient = await createServerClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return { error: 'Not authenticated' }
  if (!(await assertEventAccess(user.id, eventId))) return { error: 'Not authorized' }

  const service = createServiceClient()

  // Fetch slot + event info for cancellation emails
  const { data: slot } = await service
    .from('event_volunteer_slots')
    .select(`
      id, volunteer_role_id,
      volunteer_roles!volunteer_role_id(name),
      events!inner(event_date)
    `)
    .eq('id', slotId)
    .single()

  // Fetch all active assignments
  const { data: assignments } = await service
    .from('volunteer_assignments')
    .select('id, volunteer_name, volunteer_email')
    .eq('event_volunteer_slot_id', slotId)
    .neq('status', 'cancelled')

  // Send cancellation emails
  if (assignments?.length && slot) {
    const roleName = (slot as any).volunteer_roles?.name ?? 'volunteer'
    const eventDate = (slot as any).events?.event_date ?? ''
    const formattedDate = eventDate
      ? new Date(eventDate + 'T00:00:00').toLocaleDateString('en-US', {
          weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
        })
      : ''

    const resend = new Resend(process.env.RESEND_API_KEY)
    for (const a of assignments) {
      if (!a.volunteer_email) continue
      try {
        await resend.emails.send({
          from:    `${programName} via SidelineOps <${process.env.NEXT_PUBLIC_FROM_EMAIL}>`,
          to:      a.volunteer_email,
          subject: `Volunteer update — ${formattedDate}`,
          html: `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;padding:40px 16px">
<tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px">
<tr><td style="background:#1e293b;border-radius:16px;padding:32px">
<p style="color:#94a3b8;font-size:13px;margin:0 0 8px">${programName}</p>
<h2 style="color:#f1f5f9;font-size:20px;margin:0 0 16px">Volunteer Slot Cancelled</h2>
<p style="color:#cbd5e1;font-size:15px;margin:0 0 16px">
  Hi ${a.volunteer_name},
</p>
<p style="color:#cbd5e1;font-size:15px;margin:0 0 16px">
  The <strong style="color:#f1f5f9">${roleName}</strong> volunteer slot for <strong style="color:#f1f5f9">${formattedDate}</strong> has been cancelled. You no longer need to volunteer for this event.
</p>
<p style="color:#94a3b8;font-size:13px;margin:24px 0 0">
  If you have questions, please contact your program coordinator.
</p>
</td></tr>
</table>
</td></tr>
</table>
</body></html>`,
        })
      } catch (err) {
        console.error('[deleteSlotWithAssignments] email failed:', err)
      }
    }
  }

  // Delete all assignments then the slot
  await service
    .from('volunteer_assignments')
    .delete()
    .eq('event_volunteer_slot_id', slotId)

  const { error } = await service
    .from('event_volunteer_slots')
    .delete()
    .eq('id', slotId)

  if (error) return { error: error.message }

  revalidatePath(`/events/${eventId}`)
  return { success: true }
}
