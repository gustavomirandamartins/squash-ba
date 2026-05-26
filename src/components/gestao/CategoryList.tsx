'use client'

import { useState, useTransition } from 'react'
import { Plus, Pencil, Trash2, Check, X, AlertCircle } from 'lucide-react'
import {
  createCategory,
  updateCategory,
  deleteCategory,
} from '@/app/(app)/gestao/categorias/actions'

interface Category {
  id: string
  name: string
}

export function CategoryList({
  initialCategories,
}: {
  initialCategories: Category[]
}) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [newName, setNewName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function clearError() {
    setError(null)
  }

  function startEdit(cat: Category) {
    clearError()
    setEditingId(cat.id)
    setEditName(cat.name)
  }

  function cancelEdit() {
    setEditingId(null)
    setEditName('')
    clearError()
  }

  function handleSave() {
    if (!editName.trim() || !editingId) return
    const id = editingId
    const name = editName.trim()
    setEditingId(null)
    clearError()
    startTransition(async () => {
      try {
        await updateCategory(id, name)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao salvar.')
      }
    })
  }

  function handleDelete(id: string) {
    clearError()
    startTransition(async () => {
      try {
        await deleteCategory(id)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao excluir.')
      }
    })
  }

  function handleCreate() {
    if (!newName.trim()) return
    const name = newName.trim()
    setNewName('')
    setShowNew(false)
    clearError()
    startTransition(async () => {
      try {
        await createCategory(name)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao criar.')
      }
    })
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">Categorias</h2>
        {!showNew && (
          <button
            type="button"
            onClick={() => {
              clearError()
              setShowNew(true)
            }}
            className="flex items-center gap-1.5 rounded-full bg-secondary px-4 py-2 text-sm font-semibold text-primary transition active:scale-95 disabled:opacity-40"
            disabled={isPending}
          >
            <Plus className="h-4 w-4" />
            Nova
          </button>
        )}
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 rounded-2xl bg-red-500/15 px-4 py-3 text-sm text-red-300">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="flex-1">{error}</span>
          <button type="button" onClick={clearError} className="shrink-0 text-red-300/60 hover:text-red-300">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* New category form */}
      {showNew && (
        <div className="glass glass-card flex items-center gap-2 p-3">
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreate()
              if (e.key === 'Escape') {
                setShowNew(false)
                setNewName('')
              }
            }}
            placeholder="Nome da categoria"
            className="flex-1 bg-transparent text-sm text-white placeholder-white/35 outline-none"
          />
          <button
            type="button"
            onClick={handleCreate}
            disabled={!newName.trim() || isPending}
            className="grid h-8 w-8 place-items-center rounded-full bg-secondary text-primary transition active:scale-95 disabled:opacity-40"
          >
            <Check className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              setShowNew(false)
              setNewName('')
            }}
            className="grid h-8 w-8 place-items-center rounded-full bg-white/10 text-white/60 transition active:scale-95"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* List */}
      <div className="space-y-2">
        {initialCategories.length === 0 && !showNew && (
          <p className="py-10 text-center text-sm text-white/40">
            Nenhuma categoria cadastrada.
          </p>
        )}

        {initialCategories.map((cat) => (
          <div
            key={cat.id}
            className="glass glass-card flex items-center gap-2 px-4 py-3"
          >
            {editingId === cat.id ? (
              <>
                <input
                  autoFocus
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSave()
                    if (e.key === 'Escape') cancelEdit()
                  }}
                  className="flex-1 bg-transparent text-sm text-white outline-none"
                />
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={!editName.trim() || isPending}
                  className="grid h-8 w-8 place-items-center rounded-full bg-secondary text-primary transition active:scale-95 disabled:opacity-40"
                >
                  <Check className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={cancelEdit}
                  className="grid h-8 w-8 place-items-center rounded-full bg-white/10 text-white/60 transition active:scale-95"
                >
                  <X className="h-4 w-4" />
                </button>
              </>
            ) : (
              <>
                <span className="flex-1 text-sm text-white/85">{cat.name}</span>
                <button
                  type="button"
                  onClick={() => startEdit(cat)}
                  disabled={isPending}
                  className="grid h-8 w-8 place-items-center rounded-full text-white/40 transition hover:bg-white/8 hover:text-white/70 active:scale-95 disabled:opacity-40"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(cat.id)}
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
  )
}
