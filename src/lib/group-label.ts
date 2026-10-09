// Nome de grupo para exibição: "Grupo X".
//
// O banco tem as duas formas gravadas: "A" (criação por RPC — a convenção) e
// "Grupo A" (criações antigas e campeonatos criados offline). Aqui as duas
// viram "Grupo A", sem duplicar o prefixo e sem mexer nos dados.

export function groupLabel(name: string | null | undefined): string {
  const n = (name ?? '').trim()
  if (!n) return 'Grupo'
  return /^grupo\b/i.test(n) ? n : `Grupo ${n}`
}
