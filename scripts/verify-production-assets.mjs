import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

const root = path.resolve('dist')
const banned = [
  /Terraria/i,
  /Re-Logic/i,
  /Desktop[\\/]+Content/i,
  /TIDE_REFERENCE_ASSET_ROOT/i,
  /__tide-reference/i,
]
const textExtensions = new Set(['.html', '.js', '.css', '.json', '.map', '.txt'])

const walk = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const target = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...await walk(target))
    else files.push(target)
  }
  return files
}

const violations = []
for (const file of await walk(root)) {
  const relative = path.relative(root, file)
  for (const pattern of banned) {
    if (pattern.test(relative)) violations.push(relative + ' (filename)')
  }
  if (!textExtensions.has(path.extname(file))) continue
  const content = await readFile(file, 'utf8')
  for (const pattern of banned) {
    if (pattern.test(content)) violations.push(relative + ' (' + pattern + ')')
  }
}

if (violations.length) {
  console.error('Reference-only material leaked into dist:')
  violations.forEach((violation) => console.error('- ' + violation))
  process.exit(1)
}

console.log('Production asset audit passed: no reference paths or attributions are bundled.')
