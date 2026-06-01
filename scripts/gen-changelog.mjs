/**
 * Gera src/data/changelog.json com o histórico de commits do git.
 * Executado automaticamente antes de `next build` e `next dev`.
 *
 * O next.config.ts faz o mesmo, mas este script garante que o arquivo
 * exista antes do TypeScript/Turbopack tentarem importá-lo.
 */
import { execSync } from 'child_process'
import { writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

try {
  const count = execSync('git rev-list --count HEAD', { encoding: 'utf8', cwd: root }).trim()
  const rawLog = execSync(
    'git log --no-merges --pretty=format:%H%x09%s%x09%as',
    { encoding: 'utf8', cwd: root },
  ).trim()

  const commits = rawLog.split('\n').map((line) => {
    const parts = line.split('\t')
    return {
      hash:    parts[0]?.slice(0, 7) ?? '',
      subject: (parts[1] ?? '').trim(),
      date:    parts[2] ?? '',
    }
  })

  const dataDir = join(root, 'src', 'data')
  mkdirSync(dataDir, { recursive: true })
  writeFileSync(
    join(dataDir, 'changelog.json'),
    JSON.stringify({ count: parseInt(count, 10), commits }, null, 2),
  )
  console.log(`[gen-changelog] ${count} commits → src/data/changelog.json`)
} catch (err) {
  console.warn('[gen-changelog] git indisponível, changelog.json não atualizado:', err.message)
}
