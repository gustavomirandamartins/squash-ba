/**
 * Comprime uma imagem no browser via Canvas API antes do upload.
 *
 * Estratégia:
 * 1. Redimensiona para no máximo `maxDimension` px em qualquer lado (mantendo proporção).
 * 2. Exporta como JPEG e itera a qualidade para baixo até caber em `maxSizeKB`.
 *
 * Sem dependências externas — usa apenas Web APIs nativas (HTMLCanvasElement + toBlob).
 *
 * @param file         Arquivo de imagem original selecionado pelo usuário.
 * @param maxDimension Lado máximo em pixels (padrão: 800).
 * @param maxSizeKB    Tamanho máximo em KB (padrão: 480 — margem de segurança para 500 KB).
 * @returns            Novo File JPEG comprimido, sempre chamado "avatar.jpg".
 */
export async function compressImage(
  file: File,
  maxDimension = 800,
  maxSizeKB = 480,
): Promise<File> {
  const img = await loadImage(file)

  // Calcula as novas dimensões mantendo a proporção.
  let { naturalWidth: w, naturalHeight: h } = img
  if (w > maxDimension || h > maxDimension) {
    const ratio = Math.min(maxDimension / w, maxDimension / h)
    w = Math.round(w * ratio)
    h = Math.round(h * ratio)
  }

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D não suportado.')
  ctx.drawImage(img, 0, 0, w, h)

  const maxBytes = maxSizeKB * 1024
  // Tenta qualidades decrescentes até caber no limite.
  for (const quality of [0.85, 0.72, 0.58, 0.44]) {
    const blob = await toBlob(canvas, 'image/jpeg', quality)
    if (blob.size <= maxBytes) {
      return new File([blob], 'avatar.jpg', { type: 'image/jpeg' })
    }
  }

  // Último recurso: qualidade mínima (ainda mantém a resolução reduzida).
  const blob = await toBlob(canvas, 'image/jpeg', 0.44)
  return new File([blob], 'avatar.jpg', { type: 'image/jpeg' })
}

// ── helpers ──────────────────────────────────────────────────────────────────

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Não foi possível carregar a imagem.'))
    }
    img.src = url
  })
}

function toBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(blob)
          : reject(new Error('Falha ao converter canvas em blob.')),
      type,
      quality,
    )
  })
}
