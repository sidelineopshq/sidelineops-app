import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function POST(req: NextRequest) {
  const { token, email, password, firstName, lastName } = await req.json()

  if (!token || !email || !password) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const service = createServiceClient()

  // Re-validate the invite (token could have expired or been accepted between page load and submit)
  const { data: invite } = await service
    .from('coach_invites')
    .select('id, program_id, team_ids, role, email, expires_at, accepted_at')
    .eq('token', token)
    .maybeSingle()

  if (!invite) {
    return NextResponse.json({ error: 'Invalid invitation' }, { status: 400 })
  }
  if (new Date(invite.expires_at) < new Date()) {
    return NextResponse.json({ error: 'This invitation has expired' }, { status: 400 })
  }
  if (invite.accepted_at) {
    return NextResponse.json({ error: 'This invitation has already been accepted' }, { status: 400 })
  }
  if (invite.email.toLowerCase() !== email.toLowerCase()) {
    return NextResponse.json({ error: 'Email mismatch' }, { status: 400 })
  }

  const authClient = await createServerClient()

  // 1. Try to sign in — handles the case where the invited user already has an account
  const { data: signInData } = await authClient.auth.signInWithPassword({ email, password })

  let userId: string

  if (signInData?.user) {
    // Existing account — signed in successfully
    userId = signInData.user.id
  } else {
    // New user — create via admin API with email already confirmed.
    // Invited users have verified their identity via the invite token so
    // they don't need a separate email verification step.
    const { data: createData, error: createError } = await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        first_name: firstName?.trim() || null,
        last_name:  lastName?.trim()  || null,
      },
    })

    if (createError || !createData?.user) {
      const msg = createError?.message ?? 'Failed to create account'
      if (
        msg.toLowerCase().includes('already registered') ||
        msg.toLowerCase().includes('already exists') ||
        msg.toLowerCase().includes('duplicate')
      ) {
        return NextResponse.json(
          { error: 'An account with this email already exists. Please check your password.' },
          { status: 400 },
        )
      }
      return NextResponse.json({ error: msg }, { status: 400 })
    }

    userId = createData.user.id

    // Upsert user profile
    await service
      .from('users')
      .upsert({
        id:         userId,
        email:      email.toLowerCase(),
        first_name: firstName?.trim() || null,
        last_name:  lastName?.trim()  || null,
      }, { onConflict: 'id' })

    // Sign in immediately — user is confirmed, no verification email required
    const { data: postSignIn, error: postSignInError } = await authClient.auth.signInWithPassword({
      email,
      password,
    })

    if (postSignInError || !postSignIn?.user) {
      console.error('[accept-invite] post-creation sign-in failed:', postSignInError)
      return NextResponse.json(
        { error: 'Account created but sign-in failed. Please try logging in at /login.' },
        { status: 500 },
      )
    }
  }

  // 2. Determine permissions based on role
  type RolePerms = {
    can_manage_events:        boolean
    can_manage_contacts:      boolean
    can_send_notifications:   boolean
    can_manage_volunteers:    boolean
    can_manage_team_settings: boolean
    can_manage_meals:         boolean
  }

  const ROLE_PERMS: Record<string, RolePerms> = {
    admin: {
      can_manage_events:        true,
      can_manage_contacts:      true,
      can_send_notifications:   true,
      can_manage_volunteers:    true,
      can_manage_team_settings: true,
      can_manage_meals:         true,
    },
    coach: {
      can_manage_events:        true,
      can_manage_contacts:      true,
      can_send_notifications:   true,
      can_manage_volunteers:    true,
      can_manage_team_settings: false,
      can_manage_meals:         false,
    },
    volunteer_admin: {
      can_manage_events:        false,
      can_manage_contacts:      false,
      can_send_notifications:   false,
      can_manage_volunteers:    true,
      can_manage_team_settings: false,
      can_manage_meals:         false,
    },
    meal_coordinator: {
      can_manage_events:        false,
      can_manage_contacts:      false,
      can_send_notifications:   false,
      can_manage_volunteers:    false,
      can_manage_team_settings: false,
      can_manage_meals:         true,
    },
  }

  const perms: RolePerms = ROLE_PERMS[invite.role] ?? ROLE_PERMS.coach

  // 3. Insert team_users rows (one per team_id, skip if already exists)
  const teamUserRows = (invite.team_ids as string[]).map((teamId: string) => ({
    user_id: userId,
    team_id: teamId,
    role:    invite.role,
    ...perms,
  }))

  const { error: insertError } = await service
    .from('team_users')
    .upsert(teamUserRows, { onConflict: 'user_id,team_id', ignoreDuplicates: false })

  if (insertError) {
    console.error('[accept-invite] team_users insert error:', insertError)
    return NextResponse.json({ error: 'Failed to assign team membership' }, { status: 500 })
  }

  // 4. Mark invite as accepted
  await service
    .from('coach_invites')
    .update({ accepted_at: new Date().toISOString() })
    .eq('id', invite.id)

  return NextResponse.json({ success: true })
}
