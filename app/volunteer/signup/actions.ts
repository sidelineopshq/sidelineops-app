'use server'

import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { buildVolunteerConfirmationEmail } from '@/lib/email/volunteerConfirmation'

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function publicSignup(
  token: string,
  data: {
    first_name: string
    last_name?: string
    email?: string
  },
) {
  const trimmedName = data.first_name.trim()
  if (!trimmedName) return { error: 'First name is required.' }

  const svc = serviceClient()

  // Look up the slot by token
  const { data: slot } = await svc
    .from('event_volunteer_slots')
    .select(`
      id, slot_count, event_id,
      volunteer_roles(name),
      events(event_date, is_home, opponent, title, event_type, program_id,
        programs(name))
    `)
    .eq('signup_token', token)
    .single()

  if (!slot) return { error: 'This signup link is invalid or has expired.' }

  // Check current fill count
  const { count } = await svc
    .from('volunteer_assignments')
    .select('id', { count: 'exact', head: true })
    .eq('slot_id', slot.id)
    .neq('status', 'cancelled')

  if ((count ?? 0) >= slot.slot_count) {
    return { error: 'This volunteer slot is already full.' }
  }

  // Insert assignment
  const { data: assignment, error: insertError } = await svc
    .from('volunteer_assignments')
    .insert({
      slot_id:       slot.id,
      first_name:    trimmedName,
      last_name:     data.last_name?.trim() || null,
      email:         data.email?.trim()      || null,
      signup_source: 'public',
      status:        'confirmed',
    })
    .select('id')
    .single()

  if (insertError) return { error: insertError.message }

  // Send confirmation email (non-blocking)
  if (data.email?.trim()) {
    try {
      const event    = slot.events as any
      const program  = event?.programs as any
      const roleName = (slot.volunteer_roles as any)?.name ?? 'Volunteer'

      function eventLabel() {
        if (event.event_type === 'practice')   return 'Practice'
        if (event.event_type === 'meeting')    return 'Team Meeting'
        if (event.event_type === 'tournament') return event.title ?? 'Tournament'
        if (event.opponent) return `${event.is_home ? 'vs' : '@'} ${event.opponent}`
        return event.title ?? 'Event'
      }

      const resend = new Resend(process.env.RESEND_API_KEY)
      await resend.emails.send({
        from:    `${program?.name ?? 'SidelineOps'} via SidelineOps <${process.env.NEXT_PUBLIC_FROM_EMAIL}>`,
        to:      data.email.trim(),
        subject: `Volunteer Confirmation: ${roleName} — ${eventLabel()}`,
        html:    buildVolunteerConfirmationEmail({
          volunteerName: trimmedName,
          roleName,
          eventLabel:    eventLabel(),
          eventDate:     event.event_date,
          programName:   program?.name ?? '',
        }),
      })
    } catch (err) {
      console.error('[publicSignup] email failed:', err)
    }
  }

  return { success: true }
}
