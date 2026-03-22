import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ teamId: string }> }
) {
  const { teamId } = await params

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  const {
    token,
    player_id,
    player_name_manual,
    parent_first_name,
    parent_last_name,
    phone,
    email,
    sms_consent,
  } = body

  // Validate required fields
  if (!token || !parent_first_name || !parent_last_name || !phone) {
    return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 })
  }

  if (!sms_consent) {
    return NextResponse.json({ error: 'SMS consent is required.' }, { status: 400 })
  }

  const digits = phone.replace(/\D/g, '')
  if (digits.length !== 10) {
    return NextResponse.json({ error: 'Invalid phone number.' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // Step 1: Validate token belongs to this team and is active
  const { data: joinToken } = await supabase
    .from('team_join_tokens')
    .select('team_id, is_active')
    .eq('token', token)
    .eq('team_id', teamId)
    .eq('is_active', true)
    .single()

  if (!joinToken) {
    return NextResponse.json(
      { error: 'This signup link is no longer valid. Please contact your coach for a new link.' },
      { status: 400 }
    )
  }

  // Step 2: Get program_id from team
  const { data: team } = await supabase
    .from('teams')
    .select('program_id')
    .eq('id', teamId)
    .single()

  if (!team?.program_id) {
    return NextResponse.json({ error: 'Team not found.' }, { status: 400 })
  }

  // Step 3: Deduplicate by phone number
  // If a contact with this phone already exists for this team, update them
  const { data: existingContact } = await supabase
    .from('contacts')
    .select('id, first_name, last_name, sms_consent')
    .eq('team_id', teamId)
    .eq('phone', digits)
    .is('deleted_at', null)
    .single()

  const now = new Date().toISOString()

  if (existingContact) {
    // Update existing contact — refresh consent timestamp
    await supabase
      .from('contacts')
      .update({
        first_name:          parent_first_name,
        last_name:           parent_last_name,
        email:               email || null,
        sms_consent:         true,
        consent_timestamp:   now,
        consent_source:      'parent_signup_form',
        player_id:           player_id || null,
        join_token_used:     token,
      })
      .eq('id', existingContact.id)

    return NextResponse.json({ success: true, updated: true })
  }

  // Step 4: Create new parent contact
  const { error: contactError } = await supabase
    .from('contacts')
    .insert({
      team_id:           teamId,
      program_id:        team.program_id,
      first_name:        parent_first_name,
      last_name:         parent_last_name,
      phone:             digits,
      email:             email || null,
      contact_type:      'parent',
      sms_consent:       true,
      consent_timestamp: now,
      consent_source:    'parent_signup_form',
      player_id:         player_id || null,
      join_token_used:   token,
      is_active:         true,
    })

  if (contactError) {
    console.error('Contact insert error:', contactError)
    return NextResponse.json(
      { error: 'Failed to save your information. Please try again.' },
      { status: 500 }
    )
  }

  // Step 5: If player_name_manual was provided (not listed),
  // create a note for the coach to review
  if (player_name_manual) {
    // Update the contact we just created with a note
    await supabase
      .from('contacts')
      .update({
        notes: `Player name provided at signup: "${player_name_manual}" — needs to be linked to roster`,
      })
      .eq('team_id', teamId)
      .eq('phone', digits)
      .is('deleted_at', null)
  }

  return NextResponse.json({ success: true, updated: false })
}