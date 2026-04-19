import { constants } from 'node:fs'
import { access, cp, mkdir, rm } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const mobileDir = resolve(scriptDir, '..')
const frontendDistDir = resolve(mobileDir, '../frontend/dist')
const mobileWebDir = resolve(mobileDir, 'www')
const frontendIndexFile = resolve(frontendDistDir, 'index.html')

async function ensureFrontendDist(): Promise<void> {
  try {
    await access(frontendIndexFile, constants.F_OK)
  } catch {
    throw new Error(
      'Missing apps/frontend/dist/index.html. Run `vp run frontend#build` before syncing mobile assets.'
    )
  }
}

await ensureFrontendDist()
await rm(mobileWebDir, { force: true, recursive: true })
await mkdir(mobileWebDir, { recursive: true })
await cp(frontendDistDir, mobileWebDir, { force: true, recursive: true })

console.log(`Copied web assets from ${frontendDistDir} to ${mobileWebDir}`)
