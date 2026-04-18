import { NextResponse }          from 'next/server'
import { createClient }          from '@/lib/supabase/server'
import { generateScheduleTemplate } from '@/lib/schedule-template'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const buffer = generateScheduleTemplate()

  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      'Content-Type':        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="sidelineops-schedule-template.xlsx"',
    },
  })
}
