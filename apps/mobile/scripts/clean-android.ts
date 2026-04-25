import { rm } from 'node:fs/promises'
import { resolve } from 'node:path'

const mobileDir = resolve(import.meta.dirname, '..')
const androidDir = resolve(mobileDir, 'android')

const pathsToClean = [
  resolve(androidDir, '.gradle'),
  resolve(androidDir, 'build'),
  resolve(androidDir, 'app', 'build')
]

for (const path of pathsToClean) {
  await rm(path, { recursive: true, force: true })
  console.log(`[clean-android] removed: ${path}`)
}

console.log('[clean-android] Android native intermediates cleaned.')
