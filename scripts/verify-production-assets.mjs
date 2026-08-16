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

const fishermanAtlas = path.join(root, 'assets', 'tide-original', 'fisherman-motion.png')
const atlas = await readFile(fishermanAtlas)
const pngSignature = '89504e470d0a1a0a'
const width = atlas.readUInt32BE(16)
const height = atlas.readUInt32BE(20)
const colorType = atlas[25]
if (atlas.subarray(0, 8).toString('hex') !== pngSignature) {
  violations.push('fisherman-motion.png (invalid PNG signature)')
}
if (width !== 512 || height !== 512) {
  violations.push(`fisherman-motion.png (expected 512x512, received ${width}x${height})`)
}
if (colorType !== 6) {
  violations.push(`fisherman-motion.png (expected RGBA color type 6, received ${colorType})`)
}

const combatAtlasPath = path.join(root, 'assets', 'tide-original', 'tide-combat-atlas.png')
const combatAtlas = await readFile(combatAtlasPath)
const combatWidth = combatAtlas.readUInt32BE(16)
const combatHeight = combatAtlas.readUInt32BE(20)
const combatColorType = combatAtlas[25]
if (combatAtlas.subarray(0, 8).toString('hex') !== pngSignature) {
  violations.push('tide-combat-atlas.png (invalid PNG signature)')
}
if (combatWidth !== 640 || combatHeight !== 256) {
  violations.push(`tide-combat-atlas.png (expected 640x256, received ${combatWidth}x${combatHeight})`)
}
if (combatColorType !== 6) {
  violations.push(`tide-combat-atlas.png (expected RGBA color type 6, received ${combatColorType})`)
}

if (violations.length) {
  console.error('Reference-only material leaked into dist:')
  violations.forEach((violation) => console.error('- ' + violation))
  process.exit(1)
}

console.log('Production asset audit passed: no reference paths or attributions are bundled.')
