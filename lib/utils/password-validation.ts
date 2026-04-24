export interface PasswordValidation {
  isValid:  boolean
  errors:   string[]
  strength: 'weak' | 'medium' | 'strong'
}

export function validatePassword(password: string): PasswordValidation {
  const errors: string[] = []

  if (password.length < 8)        errors.push('At least 8 characters')
  if (!/[A-Z]/.test(password))    errors.push('At least one uppercase letter')
  if (!/[a-z]/.test(password))    errors.push('At least one lowercase letter')
  if (!/[0-9]/.test(password))    errors.push('At least one number')

  const strength: PasswordValidation['strength'] =
    errors.length === 0 && password.length >= 12
      ? 'strong'
      : errors.length === 0
        ? 'medium'
        : 'weak'

  return { isValid: errors.length === 0, errors, strength }
}
