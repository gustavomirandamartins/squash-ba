// Pontuação padrão da tabela ao criar um campeonato ou desafio.
//
//   • com empate possível (por tempo, ou empate no set ligado): V 3 · E 1 · D 0
//   • sem empate (vence por 2 pontos):                           V 1 · D 0
//
// Os assistentes trocam o padrão sozinhos quando o empate passa a ser (ou deixa
// de ser) possível — até o organizador mexer nos pontos; daí em diante vale o
// que ele escolheu. O "Empate" fica em 1 mesmo sem empate: o campo some e o
// envio já grava 0, e assim ele volta com o padrão certo se o empate for ligado.

export type TablePoints = { pointsWin: number; pointsDraw: number; pointsLoss: number }

export function defaultTablePoints(allowDraw: boolean): TablePoints {
  return allowDraw
    ? { pointsWin: 3, pointsDraw: 1, pointsLoss: 0 }
    : { pointsWin: 1, pointsDraw: 1, pointsLoss: 0 }
}

const POINT_KEYS = ['pointsWin', 'pointsDraw', 'pointsLoss'] as const

/**
 * Aplica um patch do assistente e, se o empate mudou e os pontos ainda são os
 * padrão (não editados), troca para o padrão da nova situação.
 */
export function patchWithDefaultPoints<S extends TablePoints & { pointsEdited: boolean }>(
  prev: S,
  patch: Partial<S>,
  allowDraw: (s: S) => boolean,
): S {
  const edited = prev.pointsEdited || POINT_KEYS.some((k) => k in patch)
  const next = { ...prev, ...patch, pointsEdited: edited }
  if (edited) return next
  const draw = allowDraw(next)
  return draw === allowDraw(prev) ? next : { ...next, ...defaultTablePoints(draw) }
}
