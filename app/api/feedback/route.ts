import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { Resend } from 'resend'

export async function POST(request: NextRequest) {
  try {
    const { description, pageUrl } = await request.json()
    if (!description?.trim()) {
      return NextResponse.json({ error: 'Description required' }, { status: 400 })
    }

    // Try to get the user's email (may fail if unauthenticated — that's fine)
    let userEmail = 'anonymous'
    try {
      const supabase = await createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (user?.email) userEmail = user.email
    } catch {
      // unauthenticated — ignore
    }

    const resend = new Resend(process.env.RESEND_API_KEY)
    await resend.emails.send({
      from:    `SidelineOps Feedback <${process.env.NEXT_PUBLIC_FROM_EMAIL}>`,
      to:      'support@sidelineopshq.com',
      subject: `[Feedback] Problem report from ${userEmail}`,
      html: `
        <p><strong>From:</strong> ${userEmail}</p>
        <p><strong>Page:</strong> ${pageUrl ?? 'unknown'}</p>
        <hr />
        <p>${description.replace(/\n/g, '<br>')}</p>
      `,
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[/api/feedback]', err)
    return NextResponse.json({ error: 'Failed to send' }, { status: 500 })
  }
}
