import { describe, it, expect } from 'vitest'
import { safeNextPath } from './next-path'

describe('safeNextPath', () => {
  it('aceita caminhos internos, com busca', () => {
    expect(safeNextPath('/campeonatos/abc')).toBe('/campeonatos/abc')
    expect(safeNextPath('%2Fmensagens%2F123%3Fx%3D1')).toBe('/mensagens/123?x=1')
  })

  it('recusa outro site e caminhos estranhos', () => {
    expect(safeNextPath('https://evil.com')).toBeNull()
    expect(safeNextPath('//evil.com')).toBeNull()
    expect(safeNextPath('/\\evil.com')).toBeNull()
    expect(safeNextPath('campeonatos')).toBeNull()
    expect(safeNextPath('%E0%A4%A')).toBeNull()
  })

  it('não volta para o login nem para o fluxo de autenticação', () => {
    expect(safeNextPath('/login')).toBeNull()
    expect(safeNextPath('/login?next=/x')).toBeNull()
    expect(safeNextPath('/auth/callback')).toBeNull()
  })

  it('vazio → nada', () => {
    expect(safeNextPath(null)).toBeNull()
    expect(safeNextPath('')).toBeNull()
  })
})
