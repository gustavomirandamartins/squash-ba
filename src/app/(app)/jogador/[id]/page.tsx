import { notFound } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/server'
import { MessageButton } from '@/components/jogador/MessageButton'
import { ChevronLeft, User, Award, Users, Trophy, Settings } from 'lucide-react'

export const metadata = { title: 'Jogador' }

export default async function JogadorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ from?: string }>
}) {
  const { id } = await params
  const { from } = await searchParams
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // ── Perfil (apenas dados públicos — nada de profiles_private) ──────────────
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, full_name, avatar_url, category_id, team_id')
    .eq('id', id)
    .single()

  if (!profile) notFound()

  const isSelf = user?.id === profile.id

  // ── Categoria, time, stats e nº de campeonatos (em paralelo) ───────────────
  const [catRes, teamRes, statsRes, partsRes] = await Promise.all([
    profile.category_id
      ? supabase.from('categories').select('name').eq('id', profile.category_id).single()
      : Promise.resolve({ data: null }),
    profile.team_id
      ? supabase.from('teams').select('name').eq('id', profile.team_id).single()
      : Promise.resolve({ data: null }),
    supabase.from('v_user_lifetime_stats').select('*').eq('user_id', id).maybeSingle(),
    supabase.from('participant_members').select('participant_id').eq('user_id', id),
  ])

  const categoryName = (catRes.data as { name: string } | null)?.name ?? null
  const teamName = (teamRes.data as { name: string } | null)?.name ?? null

  const stats = (statsRes.data as {
    v: number; e: number; d: number
    sets_ganhos: number; sets_perdidos: number; sets_empatados: number
  } | null) ?? null

  const v = stats?.v ?? 0
  const e = stats?.e ?? 0
  const d = stats?.d ?? 0
  const totalGames = v + e + d
  const winRate = totalGames > 0 ? Math.round((v / totalGames) * 100) : 0
  const setsG = stats?.sets_ganhos ?? 0
  const setsP = stats?.sets_perdidos ?? 0
  const nChampionships = (partsRes.data ?? []).length

  const name = profile.full_name ?? 'Jogador'

  return (
    <div className="px-5 py-4 space-y-4">
      {/* Voltar */}
      <Link
        href={from === 'comunidade' ? '/comunidade' : '/'}
        className="inline-flex items-center gap-1.5 text-sm text-white/50 transition hover:text-white/80"
      >
        <ChevronLeft className="h-4 w-4" />
        {from === 'comunidade' ? 'Comunidade' : 'Início'}
      </Link>

      {/* Cabeçalho da ficha */}
      <div className="glass glass-card flex flex-col items-center gap-3 px-5 py-6 text-center">
        <div className="relative h-24 w-24 overflow-hidden rounded-full ring-2 ring-white/15">
          {profile.avatar_url ? (
            <Image src={profile.avatar_url} alt={name} fill className="object-cover" unoptimized />
          ) : (
            <div className="grid h-full w-full place-items-center bg-secondary/15">
              <User className="h-10 w-10 text-secondary/60" />
            </div>
          )}
        </div>
        <div>
          <h1 className="font-display text-xl font-extrabold tracking-tight text-white">{name}</h1>
          <div className="mt-1.5 flex flex-wrap items-center justify-center gap-2">
            {categoryName && (
              <span className="inline-flex items-center gap-1 rounded-full bg-secondary/12 px-2.5 py-1 text-[11px] font-semibold text-secondary">
                <Award className="h-3 w-3" />
                {categoryName}
              </span>
            )}
            {teamName && (
              <span className="inline-flex items-center gap-1 rounded-full bg-white/8 px-2.5 py-1 text-[11px] font-semibold text-white/60">
                <Users className="h-3 w-3" />
                {teamName}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Estatísticas (vida toda) */}
      <div className="space-y-2">
        <p className="px-1 text-[11px] font-semibold uppercase tracking-widest text-white/35">
          Estatísticas
        </p>
        <div className="grid grid-cols-3 gap-2">
          <StatBox label="Aproveitamento" value={totalGames > 0 ? `${winRate}%` : '—'} />
          <StatBox label="Partidas" value={String(totalGames)} />
          <StatBox label="Campeonatos" value={String(nChampionships)} />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <StatBox label="Vitórias" value={String(v)} accent />
          <StatBox label="Empates" value={String(e)} />
          <StatBox label="Derrotas" value={String(d)} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <StatBox label="Sets ganhos" value={String(setsG)} />
          <StatBox label="Sets perdidos" value={String(setsP)} />
        </div>
        {totalGames === 0 && (
          <p className="px-1 pt-1 text-xs text-white/30">
            Ainda sem partidas finalizadas.
          </p>
        )}
      </div>

      {/* Ação */}
      {isSelf ? (
        <Link
          href="/perfil"
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-white/8 py-3 text-sm font-semibold text-white/75 transition active:scale-95"
        >
          <Settings className="h-4 w-4" />
          Editar meu perfil
        </Link>
      ) : user ? (
        <MessageButton userId={profile.id} />
      ) : null}

      <p className="flex items-center justify-center gap-1.5 pt-1 text-[11px] text-white/25">
        <Trophy className="h-3 w-3" />
        Ficha pública — dados de contato ficam privados
      </p>
    </div>
  )
}

function StatBox({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="glass glass-card px-3 py-3 text-center">
      <p className={`text-lg font-black tabular-nums ${accent ? 'text-secondary' : 'text-white'}`}>{value}</p>
      <p className="mt-0.5 text-[10px] text-white/35">{label}</p>
    </div>
  )
}
