import { describe, expect, it } from 'vitest'
import { MIN_PASSWORD_LENGTH, isPasswordLongEnough, translatePasswordError } from './password'

describe('regras de senha', () => {
  it('mínimo de 8 para criar ou trocar', () => {
    expect(MIN_PASSWORD_LENGTH).toBe(8)
    expect(isPasswordLongEnough('1234567')).toBe(false)
    expect(isPasswordLongEnough('12345678')).toBe(true)
  })

  it('traduz as recusas do Supabase', () => {
    expect(translatePasswordError('Password should be at least 8 characters.')).toBe('A senha precisa de pelo menos 8 caracteres.')
    expect(translatePasswordError('Password is known to be weak and easy to guess, please choose a different one.'))
      .toMatch(/fraca/)
    expect(translatePasswordError('New password should be different from the old password.')).toMatch(/diferente/)
    expect(translatePasswordError('Invalid login credentials')).toBeNull()
  })
})
