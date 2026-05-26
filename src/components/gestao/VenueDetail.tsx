'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  Pencil,
  Check,
  X,
  Plus,
  Trash2,
  AlertCircle,
} from 'lucide-react'
import {
  updateVenue,
  createCourt,
  updateCourt,
  deleteCourt,
} from '@/app/(app)/gestao/locais/actions'

interface Venue {
  id: string
  name: string
  address: string | null
}

interface Court {
  id: string
  name: string
}

interface Props {
  venue: Venue
  initialCourts: Court[]
}

export function VenueDetail({ venue, initialCourts }: Props) {
  // ── Venue edit ────────────────────────────────────────────────────────────
  const [editingVenue, setEditingVenue] = useState(false)
  const [venueName, setVenueName] = useState(venue.name)
  const [venueAddress, setVenueAddress] = useState(venue.address ?? '')

  // ── Courts ────────────────────────────────────────────────────────────────
  const [editingCourtId, setEditingCourtId] = useState<string | null>(null)
  const [editCourtName, setEditCourtName] = useState('')
  const [showNewCourt, setShowNewCourt] = useState(false)
  const [newCourtName, setNewCourtName] = useState('')

  // ── Shared ────────────────────────────────────────────────────────────────
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function clearError() {
    setError(null)
  }

  // ── Venue handlers ────────────────────────────────────────────────────────

  function cancelVenueEdit() {
    setVenueName(venue.name)
    setVenueAddress(venue.address ?? '')
    setEditingVenue(false)
    clearError()
  }

  function handleVenueSave() {
    if (!venueName.trim()) return
    setEditingVenue(false)
    clearError()
    startTransition(async () => {
      try {
        await updateVenue(
          venue.id,
          venueName.trim(),
          venueAddress.trim() || null,
        )
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao salvar local.')
        // Revert local state on error
        setVenueName(venue.name)
        setVenueAddress(venue.address ?? '')
      }
    })
  }

  // ── Court handlers ────────────────────────────────────────────────────────

  function startCourtEdit(court: Court) {
    clearError()
    setEditingCourtId(court.id)
    setEditCourtName(court.name)
  }

  function cancelCourtEdit() {
    setEditingCourtId(null)
    setEditCourtName('')
    clearError()
  }

  function handleCourtSave() {
    if (!editCourtName.trim() || !editingCourtId) return
    const id = editingCourtId
    const name = editCourtName.trim()
    setEditingCourtId(null)
    clearError()
    startTransition(async () => {
      try {
        await updateCourt(id, name, venue.id)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao salvar quadra.')
      }
    })
  }

  function handleCourtDelete(id: string) {
    clearError()
    startTransition(async () => {
      try {
        await deleteCourt(id, venue.id)
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Erro ao excluir quadra.',
        )
      }
    })
  }

  function handleCourtCreate() {
    if (!newCourtName.trim()) return
    const name = newCourtName.trim()
    setNewCourtName('')
    setShowNewCourt(false)
    clearError()
    startTransition(async () => {
      try {
        await createCourt(venue.id, name)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao criar quadra.')
      }
    })
  }

  return (
    <div className="space-y-5">
      {/* Back */}
      <Link
        href="/gestao/locais"
        className="flex items-center gap-1.5 text-sm text-white/50 transition hover:text-white/80"
      >
        <ArrowLeft className="h-4 w-4" />
        Locais
      </Link>

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

      {/* Venue info card */}
      <div className="glass glass-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-xs font-medium uppercase tracking-wide text-white/40">
            Local
          </p>
          {!editingVenue && (
            <button
              type="button"
              onClick={() => {
                clearError()
                setEditingVenue(true)
              }}
              disabled={isPending}
              className="grid h-7 w-7 place-items-center rounded-full text-white/35 transition hover:bg-white/8 hover:text-white/60 active:scale-95 disabled:opacity-40"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {editingVenue ? (
          <div className="space-y-3">
            <div className="space-y-2">
              <input
                autoFocus
                value={venueName}
                onChange={(e) => setVenueName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleVenueSave()
                  if (e.key === 'Escape') cancelVenueEdit()
                }}
                placeholder="Nome do local *"
                className="w-full bg-transparent text-sm text-white placeholder-white/35 outline-none"
              />
              <div className="h-px bg-white/8" />
              <input
                value={venueAddress}
                onChange={(e) => setVenueAddress(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleVenueSave()
                  if (e.key === 'Escape') cancelVenueEdit()
                }}
                placeholder="Endereço (opcional)"
                className="w-full bg-transparent text-sm text-white/70 placeholder-white/35 outline-none"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={cancelVenueEdit}
                className="grid h-8 w-8 place-items-center rounded-full bg-white/10 text-white/60 transition active:scale-95"
              >
                <X className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={handleVenueSave}
                disabled={!venueName.trim() || isPending}
                className="grid h-8 w-8 place-items-center rounded-full bg-secondary text-primary transition active:scale-95 disabled:opacity-40"
              >
                <Check className="h-4 w-4" />
              </button>
            </div>
          </div>
        ) : (
          <div>
            <p className="text-base font-semibold text-white/90">{venueName}</p>
            {venueAddress && (
              <p className="mt-1 text-sm text-white/50">{venueAddress}</p>
            )}
          </div>
        )}
      </div>

      {/* Courts section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-white">Quadras</h3>
          {!showNewCourt && (
            <button
              type="button"
              onClick={() => {
                clearError()
                setShowNewCourt(true)
              }}
              disabled={isPending}
              className="flex items-center gap-1.5 rounded-full bg-secondary px-4 py-2 text-sm font-semibold text-primary transition active:scale-95 disabled:opacity-40"
            >
              <Plus className="h-4 w-4" />
              Nova
            </button>
          )}
        </div>

        {/* New court form */}
        {showNewCourt && (
          <div className="glass glass-card flex items-center gap-2 p-3">
            <input
              autoFocus
              value={newCourtName}
              onChange={(e) => setNewCourtName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCourtCreate()
                if (e.key === 'Escape') {
                  setShowNewCourt(false)
                  setNewCourtName('')
                }
              }}
              placeholder="Ex: Quadra 1, Quadra Central"
              className="flex-1 bg-transparent text-sm text-white placeholder-white/35 outline-none"
            />
            <button
              type="button"
              onClick={handleCourtCreate}
              disabled={!newCourtName.trim() || isPending}
              className="grid h-8 w-8 place-items-center rounded-full bg-secondary text-primary transition active:scale-95 disabled:opacity-40"
            >
              <Check className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                setShowNewCourt(false)
                setNewCourtName('')
              }}
              className="grid h-8 w-8 place-items-center rounded-full bg-white/10 text-white/60 transition active:scale-95"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Courts list */}
        <div className="space-y-2">
          {initialCourts.length === 0 && !showNewCourt && (
            <p className="py-8 text-center text-sm text-white/40">
              Nenhuma quadra cadastrada.
            </p>
          )}

          {initialCourts.map((court) => (
            <div
              key={court.id}
              className="glass glass-card flex items-center gap-2 px-4 py-3"
            >
              {editingCourtId === court.id ? (
                <>
                  <input
                    autoFocus
                    value={editCourtName}
                    onChange={(e) => setEditCourtName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleCourtSave()
                      if (e.key === 'Escape') cancelCourtEdit()
                    }}
                    className="flex-1 bg-transparent text-sm text-white outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleCourtSave}
                    disabled={!editCourtName.trim() || isPending}
                    className="grid h-8 w-8 place-items-center rounded-full bg-secondary text-primary transition active:scale-95 disabled:opacity-40"
                  >
                    <Check className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={cancelCourtEdit}
                    className="grid h-8 w-8 place-items-center rounded-full bg-white/10 text-white/60 transition active:scale-95"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </>
              ) : (
                <>
                  <span className="flex-1 text-sm text-white/85">
                    {court.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => startCourtEdit(court)}
                    disabled={isPending}
                    className="grid h-8 w-8 place-items-center rounded-full text-white/40 transition hover:bg-white/8 hover:text-white/70 active:scale-95 disabled:opacity-40"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCourtDelete(court.id)}
                    disabled={isPending}
                    className="grid h-8 w-8 place-items-center rounded-full text-white/40 transition hover:bg-white/8 hover:text-red-400 active:scale-95 disabled:opacity-40"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
