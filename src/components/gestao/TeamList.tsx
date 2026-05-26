'use client'

import { useState, useTransition } from 'react'
import {
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
  AlertCircle,
  MapPin,
  Building2,
} from 'lucide-react'
import {
  createTeam,
  updateTeam,
  deleteTeam,
} from '@/app/(app)/gestao/times/actions'

interface Team {
  id: string
  name: string
  address: string | null
  has_own_venue: boolean
  home_venue_id: string | null
}

interface Venue {
  id: string
  name: string
}

interface FormState {
  name: string
  address: string
  hasVenue: boolean
  venueId: string
}

const emptyForm: FormState = {
  name: '',
  address: '',
  hasVenue: false,
  venueId: '',
}

// ── Inline form shared by create and edit ────────────────────────────────────

function TeamForm({
  form,
  venues,
  isPending,
  onSave,
  onCancel,
  onChange,
}: {
  form: FormState
  venues: Venue[]
  isPending: boolean
  onSave: () => void
  onCancel: () => void
  onChange: (patch: Partial<FormState>) => void
}) {
  const canSave =
    form.name.trim() !== '' && (!form.hasVenue || form.venueId !== '')

  return (
    <div className="glass glass-card space-y-3 p-4">
      {/* Name */}
      <input
        autoFocus
        value={form.name}
        onChange={(e) => onChange({ name: e.target.value })}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && canSave) onSave()
          if (e.key === 'Escape') onCancel()
        }}
        placeholder="Nome do time *"
        className="w-full bg-transparent text-sm text-white placeholder-white/35 outline-none"
      />
      <div className="h-px bg-white/8" />

      {/* Address */}
      <input
        value={form.address}
        onChange={(e) => onChange({ address: e.target.value })}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onCancel()
        }}
        placeholder="Endereço (opcional)"
        className="w-full bg-transparent text-sm text-white/70 placeholder-white/35 outline-none"
      />
      <div className="h-px bg-white/8" />

      {/* Has own venue toggle */}
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-white/65">Tem quadra própria?</span>
        <button
          type="button"
          onClick={() =>
            onChange({ hasVenue: !form.hasVenue, venueId: '' })
          }
          className={`rounded-full px-3 py-1 text-xs font-semibold transition active:scale-95 ${
            form.hasVenue
              ? 'bg-secondary text-primary'
              : 'bg-white/10 text-white/50'
          }`}
        >
          {form.hasVenue ? 'Sim' : 'Não'}
        </button>
      </div>

      {/* Venue selector */}
      {form.hasVenue && (
        <>
          <div className="h-px bg-white/8" />
          {venues.length === 0 ? (
            <p className="text-xs text-white/40">
              Nenhum local cadastrado. Cadastre em{' '}
              <span className="text-secondary/70">Gestão → Locais</span>.
            </p>
          ) : (
            <select
              value={form.venueId}
              onChange={(e) => onChange({ venueId: e.target.value })}
              className="w-full appearance-none rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none"
            >
              <option value="" disabled className="bg-[#1d2b45]">
                Selecione o local...
              </option>
              {venues.map((v) => (
                <option key={v.id} value={v.id} className="bg-[#1d2b45]">
                  {v.name}
                </option>
              ))}
            </select>
          )}
        </>
      )}

      {/* Actions */}
      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="grid h-8 w-8 place-items-center rounded-full bg-white/10 text-white/60 transition active:scale-95"
        >
          <X className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={!canSave || isPending}
          className="grid h-8 w-8 place-items-center rounded-full bg-secondary text-primary transition active:scale-95 disabled:opacity-40"
        >
          <Check className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

// ── Main list component ──────────────────────────────────────────────────────

export function TeamList({
  initialTeams,
  venues,
}: {
  initialTeams: Team[]
  venues: Venue[]
}) {
  const [showNew, setShowNew] = useState(false)
  const [newForm, setNewForm] = useState<FormState>(emptyForm)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<FormState>(emptyForm)

  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // Build venue name lookup
  const venueMap = new Map(venues.map((v) => [v.id, v.name]))

  function clearError() {
    setError(null)
  }

  // ── New team ──────────────────────────────────────────────────────────────

  function cancelNew() {
    setShowNew(false)
    setNewForm(emptyForm)
    clearError()
  }

  function handleCreate() {
    if (!newForm.name.trim()) return
    const { name, address, hasVenue, venueId } = newForm
    cancelNew()
    startTransition(async () => {
      try {
        await createTeam(
          name,
          address || null,
          hasVenue,
          hasVenue && venueId ? venueId : null,
        )
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao criar time.')
      }
    })
  }

  // ── Edit team ─────────────────────────────────────────────────────────────

  function startEdit(team: Team) {
    clearError()
    setShowNew(false)
    setNewForm(emptyForm)
    setEditingId(team.id)
    setEditForm({
      name: team.name,
      address: team.address ?? '',
      hasVenue: team.has_own_venue,
      venueId: team.home_venue_id ?? '',
    })
  }

  function cancelEdit() {
    setEditingId(null)
    setEditForm(emptyForm)
    clearError()
  }

  function handleUpdate() {
    if (!editForm.name.trim() || !editingId) return
    const id = editingId
    const { name, address, hasVenue, venueId } = editForm
    cancelEdit()
    startTransition(async () => {
      try {
        await updateTeam(
          id,
          name,
          address || null,
          hasVenue,
          hasVenue && venueId ? venueId : null,
        )
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao salvar time.')
      }
    })
  }

  // ── Delete team ───────────────────────────────────────────────────────────

  function handleDelete(id: string) {
    clearError()
    startTransition(async () => {
      try {
        await deleteTeam(id)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao excluir time.')
      }
    })
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">Times</h2>
        {!showNew && (
          <button
            type="button"
            onClick={() => {
              clearError()
              cancelEdit()
              setShowNew(true)
            }}
            disabled={isPending}
            className="flex items-center gap-1.5 rounded-full bg-secondary px-4 py-2 text-sm font-semibold text-primary transition active:scale-95 disabled:opacity-40"
          >
            <Plus className="h-4 w-4" />
            Novo
          </button>
        )}
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 rounded-2xl bg-red-500/15 px-4 py-3 text-sm text-red-300">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="flex-1">{error}</span>
          <button
            type="button"
            onClick={clearError}
            className="shrink-0 text-red-300/60 hover:text-red-300"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* New team form */}
      {showNew && (
        <TeamForm
          form={newForm}
          venues={venues}
          isPending={isPending}
          onSave={handleCreate}
          onCancel={cancelNew}
          onChange={(patch) => setNewForm((f) => ({ ...f, ...patch }))}
        />
      )}

      {/* Teams list */}
      <div className="space-y-2">
        {initialTeams.length === 0 && !showNew && (
          <p className="py-10 text-center text-sm text-white/40">
            Nenhum time cadastrado.
          </p>
        )}

        {initialTeams.map((team) =>
          editingId === team.id ? (
            /* Edit form in place of row */
            <TeamForm
              key={team.id}
              form={editForm}
              venues={venues}
              isPending={isPending}
              onSave={handleUpdate}
              onCancel={cancelEdit}
              onChange={(patch) => setEditForm((f) => ({ ...f, ...patch }))}
            />
          ) : (
            /* Normal row */
            <div
              key={team.id}
              className="glass glass-card flex items-center gap-2 px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-white/90">
                  {team.name}
                </p>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                  {team.address && (
                    <span className="flex items-center gap-1 text-xs text-white/45">
                      <MapPin className="h-3 w-3 shrink-0" />
                      <span className="truncate">{team.address}</span>
                    </span>
                  )}
                  {team.has_own_venue && team.home_venue_id && (
                    <span className="flex items-center gap-1 text-xs text-secondary/70">
                      <Building2 className="h-3 w-3 shrink-0" />
                      {venueMap.get(team.home_venue_id) ?? '—'}
                    </span>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={() => startEdit(team)}
                disabled={isPending}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-white/35 transition hover:bg-white/8 hover:text-white/60 active:scale-95 disabled:opacity-40"
              >
                <Pencil className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => handleDelete(team.id)}
                disabled={isPending}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-white/35 transition hover:bg-white/8 hover:text-red-400 active:scale-95 disabled:opacity-40"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ),
        )}
      </div>
    </div>
  )
}
