/**
 * Sends a message via the GroupMe Bots API.
 *
 * Usage:
 * ```ts
 * import { sendGroupMeMessage } from '@/lib/notifications/groupme'
 *
 * const ok = await sendGroupMeMessage(team.groupme_bot_id, 'Practice cancelled today.')
 * if (!ok) console.warn('GroupMe message failed to send')
 * ```
 *
 * The bot must already be created in GroupMe and associated with the target
 * group. Bot IDs are obtained from the GroupMe developer portal at
 * https://dev.groupme.com/bots.
 *
 * @param botId - The GroupMe bot ID to post as.
 * @param text  - The message text to send (max 1000 characters per GroupMe limits).
 * @returns       `true` if the message was accepted (HTTP 202), `false` otherwise.
 */
export async function sendGroupMeMessage(botId: string, text: string): Promise<boolean> {
  try {
    const res = await fetch('https://api.groupme.com/v3/bots/post', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ bot_id: botId, text }),
    })

    if (!res.ok) {
      console.error(`[groupme] Post failed — status ${res.status} for bot ${botId}`)
      return false
    }

    return true
  } catch (err) {
    console.error(`[groupme] Post threw for bot ${botId}:`, err)
    return false
  }
}
