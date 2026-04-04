'use server'

import { createClient } from '@supabase/supabase-js'

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function createAccount({
  code,
  firstName,
  lastName,
  email,
  password,
}: {
  code:      string
  firstName: string
  lastName:  string
  email:     string
  password:  string
}): Promise<{ error?: string; success?: true }> {
  const supabase = serviceClient()

  // a. Re-validate access code (race-condition protection)
  const { data: accessCode } = await supabase
    .from('access_codes')
    .select('id, use_count, max_uses, expires_at, is_active')
    .eq('code', code)
    .maybeSingle()

  if (
    !accessCode ||
    !accessCode.is_active ||
    (accessCode.expires_at && new Date(accessCode.expires_at) < new Date()) ||
    (accessCode.max_uses != null && accessCode.use_count >= accessCode.max_uses)
  ) {
    return { error: 'This access code is no longer valid.' }
  }

  // b. Sign up via auth
  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { first_name: firstName, last_name: lastName },
      emailRedirectTo: `${process.env.BASE_URL}/auth/callback?next=/onboarding`,
    },
  })

  if (signUpError) {
    if (
      signUpError.message.toLowerCase().includes('already registered') ||
      signUpError.message.toLowerCase().includes('already exists') ||
      signUpError.message.toLowerCase().includes('email address is already')
    ) {
      return {
        error: 'An account with this email already exists. Try logging in instead.',
      }
    }
    return { error: signUpError.message }
  }

  const userId = signUpData.user?.id
  if (!userId) {
    return { error: 'Account creation failed. Please try again.' }
  }

  // c. Increment use_count
  await supabase
    .from('access_codes')
    .update({ use_count: (accessCode.use_count ?? 0) + 1 })
    .eq('id', accessCode.id)

  // d. Insert into public.users (ignore conflict — user may already exist)
  await supabase
    .from('users')
    .upsert(
      { id: userId, first_name: firstName, last_name: lastName, email },
      { onConflict: 'id', ignoreDuplicates: true },
    )

  return { success: true }
}

export async function joinWaitlist(email: string): Promise<{ error?: string; success?: true }> {
  if (!email.trim() || !email.includes('@')) {
    return { error: 'Please enter a valid email address.' }
  }

  const supabase = serviceClient()

  const { error } = await supabase
    .from('waitlist')
    .insert({ email: email.trim().toLowerCase() })

  if (error) {
    // Duplicate email — treat as success so we don't leak info
    if (error.code === '23505') return { success: true }
    console.error('[joinWaitlist]', error)
    return { error: 'Something went wrong. Please try again.' }
  }

  return { success: true }
}
