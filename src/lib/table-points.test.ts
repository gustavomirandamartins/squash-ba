import { describe, it, expect } from 'vitest'
import { defaultTablePoints, patchWithDefaultPoints } from './table-points'

type S = { pointsWin: number; pointsDraw: number; pointsLoss: number; pointsEdited: boolean; draw: boolean }
const allow = (s: S) => s.draw
const start: S = { ...defaultTablePoints(false), pointsEdited: false, draw: false }

describe('pontuação padrão da tabela', () => {
  it('sem empate: V 1 · D 0; com empate: V 3 · E 1 · D 0', () => {
    expect(defaultTablePoints(false)).toMatchObject({ pointsWin: 1, pointsLoss: 0 })
    expect(defaultTablePoints(true)).toEqual({ pointsWin: 3, pointsDraw: 1, pointsLoss: 0 })
  })

  it('troca o padrão quando o empate é ligado e desligado', () => {
    const on = patchWithDefaultPoints(start, { draw: true }, allow)
    expect(on).toMatchObject({ pointsWin: 3, pointsDraw: 1, pointsLoss: 0 })
    const off = patchWithDefaultPoints(on, { draw: false }, allow)
    expect(off).toMatchObject({ pointsWin: 1, pointsLoss: 0 })
  })

  it('não mexe em outras mudanças', () => {
    const s = patchWithDefaultPoints(start, {}, allow)
    expect(s).toEqual(start)
  })

  it('depois que o organizador edita, o padrão não troca mais', () => {
    const edited = patchWithDefaultPoints(start, { pointsWin: 2 }, allow)
    expect(edited.pointsEdited).toBe(true)
    const on = patchWithDefaultPoints(edited, { draw: true }, allow)
    expect(on).toMatchObject({ pointsWin: 2, pointsDraw: 1, pointsLoss: 0 })
  })
})
