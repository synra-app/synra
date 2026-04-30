import { gzipSync } from 'fflate'
import { expect, test } from 'vite-plus/test'
import { extractNpmTgzToMap, extractUstarTarToMap } from '../src/browser/tgz-extract'
import {
  DEFAULT_SYNRA_UI_ENTRY,
  resolveSynraPluginUiEntryAbsolutePath
} from '../src/resolve-ui-entry.ts'

function buildMinimalUstarTar(files: Array<{ path: string; body: string }>): Uint8Array {
  const blocks: Uint8Array[] = []
  for (const { path, body } of files) {
    const header = new Uint8Array(512)
    const nameBytes = new TextEncoder().encode(path)
    if (nameBytes.length > 100) {
      throw new Error('path too long for test helper')
    }
    header.set(nameBytes, 0)
    const size = new TextEncoder().encode(body).length
    const sizeOctal = size.toString(8).padStart(11, '0') + ' '
    const sizeEnc = new TextEncoder().encode(sizeOctal)
    header.set(sizeEnc, 124)
    header[156] = 48 // '0'
    blocks.push(header)
    const bodyBytes = new TextEncoder().encode(body)
    const padded = new Uint8Array(Math.ceil(bodyBytes.length / 512) * 512)
    padded.set(bodyBytes)
    blocks.push(padded)
  }
  blocks.push(new Uint8Array(512))
  const total = blocks.reduce((sum, b) => sum + b.length, 0)
  const out = new Uint8Array(total)
  let o = 0
  for (const b of blocks) {
    out.set(b, o)
    o += b.length
  }
  return out
}

test('extractUstarTarToMap reads file entry', () => {
  const tar = buildMinimalUstarTar([{ path: 'package/hello.txt', body: 'x' }])
  const map = extractUstarTarToMap(tar)
  expect(map.get('package/hello.txt')).toBeDefined()
  expect(new TextDecoder().decode(map.get('package/hello.txt')!)).toBe('x')
})

test('extractNpmTgzToMap gunzips and extracts', () => {
  const tar = buildMinimalUstarTar([{ path: 'package/a.json', body: '{}' }])
  const tgz = gzipSync(tar)
  const map = extractNpmTgzToMap(
    tgz.buffer.slice(tgz.byteOffset, tgz.byteOffset + tgz.byteLength) as ArrayBuffer
  )
  expect(new TextDecoder().decode(map.get('package/a.json')!)).toBe('{}')
})

/** Ensures default UI path under `package/` matches `resolveSynraPluginUiEntryAbsolutePath` (inbound verify-ui). */
test('extractNpmTgzToMap keys align with default Synra UI entry path', () => {
  const tarballRelKey = `package/${DEFAULT_SYNRA_UI_ENTRY}`
  const tar = buildMinimalUstarTar([
    { path: 'package/package.json', body: '{"name":"x","version":"1.0.0"}' },
    { path: tarballRelKey, body: 'export {}' }
  ])
  const tgz = gzipSync(tar)
  const map = extractNpmTgzToMap(
    tgz.buffer.slice(tgz.byteOffset, tgz.byteOffset + tgz.byteLength) as ArrayBuffer
  )
  expect(map.get(tarballRelKey)).toBeDefined()
  const artifactRel = 'synra/plugins/p/1.0.0'
  const uiAbs = resolveSynraPluginUiEntryAbsolutePath(artifactRel, undefined).replace(/\\/g, '/')
  expect(uiAbs.endsWith(`${tarballRelKey}`)).toBe(true)
})
