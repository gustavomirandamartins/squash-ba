import { describe, it, expect } from 'vitest'
import { groupLabel } from './group-label'

describe('groupLabel', () => {
  it('acrescenta "Grupo" ao nome curto', () => {
    expect(groupLabel('A')).toBe('Grupo A')
    expect(groupLabel('12')).toBe('Grupo 12')
  })

  it('não duplica quando o nome já começa com "Grupo"', () => {
    expect(groupLabel('Grupo A')).toBe('Grupo A')
    expect(groupLabel('grupo b')).toBe('grupo b')
  })

  it('não confunde nomes que só começam com as mesmas letras', () => {
    expect(groupLabel('Grupão')).toBe('Grupo Grupão')
  })

  it('nome vazio vira só "Grupo"', () => {
    expect(groupLabel('')).toBe('Grupo')
    expect(groupLabel(null)).toBe('Grupo')
    expect(groupLabel('  B ')).toBe('Grupo B')
  })
})
