'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import {
  Plus,
  ChevronRight,
  Trash2,
  Check,
  X,
  AlertCircle,
  MapPin,
} from 'lucide-react'
import { createVenue, deleteVenue } from '@/app/(app)/gestao/locais/actions'

interface Venue {
  id: string
  name: string
  address: string | null
  courts: { id: string }[]
}

export function VenueList({ initialVenues }: { initialVenues: Venue[] }) {
  const [showNew, setShowNew] = useState(false)
  const [newName, setNewName] = useState('')
  const [newAddress, setNewAddress] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function clearError() {
    setError(null)
  }

  function cancelNew() {
    setShowNew(false)
    setNewName('')
    setNewAddress('')
    clearError()
  }

  function handleCreate() {
    if (!newName.trim()) return
    const name = newName.trim()
    const address = newAddress.trim() || null
    cancelNew()
    startTransition(async () => {
      try {
        await createVenue(name, address)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao criar local.')
      }
    })
  }

  function handleDeleteClick(venue: Venue) {
    if (venue.courts.length === 0) {
      // Delete immediately if no courts
      startTransition(async () => {
        try {
          await deleteVenue(venue.id)
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Erro ao excluir local.')
        }
      })
    } else {
      setConfirmDeleteId(venue.id)
    }
  }

  function handleDeleteConfirm(id: string) {
    setConfirmDeleteId(null)
    clearError()
    startTransition(async () => {
      try {
        await deleteVenue(id)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao excluir local.')
      }
    })
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">Locais</h2>
        {!showNew && (
          <button
            type="button"
            onClick={() => {
              clearError()
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

      {/* New venue form */}
      {showNew && (
        <div className="glass glass-card space-y-2 p-4">
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreate()
              if (e.key === 'Escape') cancelNew()
            }}
            placeholder="Nome do local *"
            className="w-full bg-transparent text-sm text-white placeholder-white/35 outline-none"
          />
          <div className="h-px bg-white/8" />
          <input
            value={newAddress}
            onChange={(e) => setNewAddress(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreate()
              if (e.key === 'Escape') cancelNew()
            }}
            placeholder="Endereço (opcional)"
            className="w-full bg-transparent text-sm text-white/70 placeholder-white/35 outline-none"
          />
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={cancelNew}
              className="grid h-8 w-8 place-items-center rounded-full bg-white/10 text-white/60 transition active:scale-95"
            >
              <X className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={handleCreate}
              disabled={!newName.trim() || isPending}
              className="grid h-8 w-8 place-items-center rounded-full bg-secondary text-primary transition active:scale-95 disabled:opacity-40"
            >
              <Check className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Venues list */}
      <div className="space-y-2">
        {initialVenues.length === 0 && !showNew && (
          <p className="py-10 text-center text-sm text-white/40">
            Nenhum local cadastrado.
          </p>
        )}

        {initialVenues.map((venue) => (
          <div key={venue.id}>
            {confirmDeleteId === venue.id ? (
              /* Confirm delete */
              <div className="glass glass-card flex items-center gap-3 px-4 py-3">
                <p className="flex-1 text-sm text-red-300">
                  Excluir &ldquo;{venue.name}&rdquo; e{' '}
                  {venue.courts.length === 1
                    ? '1 quadra'
                    : `${venue.courts.length} quadras`}
                  ?
                </p>
                <button
                  type="button"
                  onClick={() => handleDeleteConfirm(venue.id)}
                  disabled={isPending}
                  className="rounded-full bg-red-500/20 px-3 py-1 text-xs font-medium text-red-300 transition hover:bg-red-500/30 active:scale-95 disabled:opacity-40"
                >
                  Excluir
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDeleteId(null)}
                  className="grid h-7 w-7 place-items-center rounded-full bg-white/10 text-white/50 transition active:scale-95"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              /* Normal row */
              <div className="glass glass-card flex items-center gap-1 pr-2">
                <Link
                  href={`/gestao/locais/${venue.id}`}
                  className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-white/90">
                      {venue.name}
                    </p>
                    {venue.address && (
                      <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-white/45">
                        <MapPin className="h-3 w-3 shrink-0" />
                        {venue.address}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-white/55">
                      {venue.courts.length}{' '}
                      {venue.courts.length === 1 ? 'quadra' : 'quadras'}
                    </span>
                    <ChevronRight className="h-4 w-4 text-white/25" />
                  </div>
                </Link>
                <button
                  type="button"
                  onClick={() => handleDeleteClick(venue)}
                  disabled={isPending}
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-white/30 transition hover:bg-white/8 hover:text-red-400 active:scale-95 disabled:opacity-40"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
