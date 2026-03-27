import { createHmac, timingSafeEqual } from 'crypto'

/**
 * Generates a tamper-proof unsubscribe token for a contact.
 *
 * Format: `base64url(contactId) + '.' + hex(HMAC-SHA256(contactId, UNSUBSCRIBE_SECRET))`
 *
 * The token is safe to embed in email links — it encodes the contact ID and
 * proves it was issued by this server without exposing any secret.
 *
 * @param contactId - The UUID of the contact to generate a token for.
 * @returns         A URL-safe token string.
 *
 * @example
 * ```ts
 * const token = generateUnsubscribeToken(contact.id)
 * const url   = `${appUrl}/api/unsubscribe?token=${token}`
 * ```
 */
export function generateUnsubscribeToken(contactId: string): string {
  const secret = process.env.UNSUBSCRIBE_SECRET!
  const idPart = Buffer.from(contactId).toString('base64url')
  const sig    = createHmac('sha256', secret).update(contactId).digest('hex')
  return `${idPart}.${sig}`
}

/**
 * Parses and verifies an unsubscribe token produced by {@link generateUnsubscribeToken}.
 *
 * Verification steps:
 * 1. Splits on the first `.` to extract the encoded ID and signature.
 * 2. Decodes the base64url ID and validates it looks like a UUID.
 * 3. Recomputes the expected HMAC and compares using a constant-time equality
 *    check to prevent timing-based signature oracle attacks.
 *
 * @param token - The raw token string from the query parameter.
 * @returns       The contact UUID if the token is valid, or `null` if it is
 *                malformed, has an invalid signature, or cannot be decoded.
 */
export function verifyUnsubscribeToken(token: string): string | null {
  const dotIndex = token.indexOf('.')
  if (dotIndex === -1) return null

  const idPart = token.slice(0, dotIndex)
  const sig    = token.slice(dotIndex + 1)

  if (!idPart || !sig) return null

  let contactId: string
  try {
    contactId = Buffer.from(idPart, 'base64url').toString('utf-8')
  } catch {
    return null
  }

  // UUID sanity check — prevents degenerate inputs from reaching the DB
  if (!/^[0-9a-f-]{36}$/i.test(contactId)) return null

  const secret      = process.env.UNSUBSCRIBE_SECRET!
  const expectedSig = createHmac('sha256', secret).update(contactId).digest('hex')

  // Constant-time comparison prevents timing-based signature oracle attacks
  try {
    const sigBuf      = Buffer.from(sig,         'hex')
    const expectedBuf = Buffer.from(expectedSig, 'hex')
    if (sigBuf.length !== expectedBuf.length) return null
    if (!timingSafeEqual(sigBuf, expectedBuf))  return null
  } catch {
    return null
  }

  return contactId
}
