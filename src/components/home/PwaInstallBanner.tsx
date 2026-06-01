'use client'

import { useState, useEffect } from 'react'
import { Smartphone, X, Share } from 'lucide-react'

type Platform = 'ios' | 'android' | 'other'

function detectPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'other'
  const ua = navigator.userAgent
  // iPadOS 13+ reporta como "Macintosh" mas tem maxTouchPoints > 1
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios'
  if (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1) return 'ios'
  if (/android/i.test(ua)) return 'android'
  return 'other'
}

function isInstalled(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as { standalone?: boolean }).standalone === true
  )
}

const DISMISS_KEY = 'pwa-install-dismissed-v1'

export function PwaInstallBanner() {
  const [platform, setPlatform] = useState<Platform>('other')
  const [visible, setVisible] = useState(false)
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<'ios' | 'android'>('ios')
  // Prompt nativo Android (beforeinstallprompt)
  const [deferredPrompt, setDeferredPrompt] = useState<Event & { prompt(): Promise<void> } | null>(null)

  useEffect(() => {
    if (isInstalled()) return
    if (localStorage.getItem(DISMISS_KEY)) return

    const p = detectPlatform()
    setPlatform(p)
    setTab(p === 'android' ? 'android' : 'ios')
    setVisible(true)

    // Captura evento de instalação nativa no Android/Chrome
    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as Event & { prompt(): Promise<void> })
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  function dismiss() {
    setVisible(false)
    localStorage.setItem(DISMISS_KEY, '1')
  }

  async function handleAndroidInstall() {
    if (deferredPrompt) {
      await deferredPrompt.prompt()
      setDeferredPrompt(null)
      dismiss()
    } else {
      setOpen(true)
    }
  }

  if (!visible) return null

  return (
    <>
      {/* ── Banner ──────────────────────────────────────────────── */}
      <div className="mx-5 flex items-center gap-3 rounded-2xl border border-secondary/20 bg-secondary/8 px-4 py-3">
        <Smartphone className="h-4 w-4 shrink-0 text-secondary" />
        <button
          type="button"
          onClick={() => (platform === 'android' && deferredPrompt ? handleAndroidInstall() : setOpen(true))}
          className="flex-1 text-left text-sm font-semibold text-secondary/90"
        >
          Instale o app na tela de início
        </button>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dispensar"
          className="shrink-0 rounded-full p-1 text-white/30 transition hover:text-white/50"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* ── Modal / bottom-sheet ─────────────────────────────────── */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end bg-black/50 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full rounded-t-3xl bg-[#1a2d48] px-5 pt-4 pb-[max(2rem,env(safe-area-inset-bottom))] space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Alça */}
            <div className="mx-auto h-1 w-10 rounded-full bg-white/15" />

            {/* Cabeçalho */}
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-extrabold text-white">Instalar app</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full p-1 text-white/40 transition hover:text-white/70"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Tabs (só quando plataforma não detectada) */}
            {platform === 'other' && (
              <div className="flex gap-1 rounded-xl bg-white/6 p-1">
                {(['ios', 'android'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={`flex-1 rounded-lg py-2 text-sm font-semibold transition ${
                      tab === t ? 'bg-secondary text-primary' : 'text-white/50 hover:text-white/70'
                    }`}
                  >
                    {t === 'ios' ? 'iPhone / iPad' : 'Android'}
                  </button>
                ))}
              </div>
            )}

            {/* ── iOS ─────────────────────────────────────────────── */}
            {(platform === 'ios' || (platform === 'other' && tab === 'ios')) && (
              <div className="space-y-4">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-white/35">
                  iPhone / iPad · Safari
                </p>
                <Steps
                  items={[
                    'Abra este site no Safari (não Chrome ou Firefox).',
                    <>
                      Toque no ícone{' '}
                      <Share className="mb-0.5 inline h-3.5 w-3.5 text-secondary" />{' '}
                      <strong className="text-secondary">Compartilhar</strong> na barra inferior do Safari.
                    </>,
                    <>
                      Role para baixo e toque em{' '}
                      <strong className="text-secondary">"Adicionar à Tela de Início"</strong>.
                    </>,
                    'Confirme tocando em "Adicionar". O ícone aparecerá na sua tela de início!',
                  ]}
                />
              </div>
            )}

            {/* ── Android ─────────────────────────────────────────── */}
            {(platform === 'android' || (platform === 'other' && tab === 'android')) && (
              <div className="space-y-4">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-white/35">
                  Android · Chrome
                </p>
                <Steps
                  items={[
                    'Abra este site no Chrome.',
                    <>
                      Toque no menu{' '}
                      <strong className="text-secondary">⋮</strong>{' '}
                      no canto superior direito.
                    </>,
                    <>
                      Toque em{' '}
                      <strong className="text-secondary">"Adicionar à tela inicial"</strong>{' '}
                      ou{' '}
                      <strong className="text-secondary">"Instalar app"</strong>.
                    </>,
                    'Confirme tocando em "Adicionar". O ícone aparecerá na sua tela de início!',
                  ]}
                />
                {deferredPrompt && (
                  <button
                    type="button"
                    onClick={handleAndroidInstall}
                    className="w-full rounded-2xl bg-secondary py-3.5 text-base font-bold text-primary transition active:scale-[0.98]"
                  >
                    Instalar agora
                  </button>
                )}
              </div>
            )}

            <p className="text-center text-xs text-white/25">
              Este aviso não aparecerá novamente após dispensar.
            </p>
          </div>
        </div>
      )}
    </>
  )
}

function Steps({ items }: { items: React.ReactNode[] }) {
  return (
    <div className="space-y-3">
      {items.map((text, i) => (
        <div key={i} className="flex items-start gap-3">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-secondary/15 text-xs font-bold text-secondary">
            {i + 1}
          </span>
          <p className="text-sm leading-relaxed text-white/70">{text}</p>
        </div>
      ))}
    </div>
  )
}
