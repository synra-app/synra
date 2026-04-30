import { gunzipSync } from 'fflate'

function decodeTarString(bytes: Uint8Array): string {
  let end = bytes.length
  for (let i = 0; i < bytes.length; i += 1) {
    if (bytes[i] === 0) {
      end = i
      break
    }
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes.subarray(0, end))
}

function parseOctal(field: Uint8Array): number {
  const text = decodeTarString(field).trim()
  if (!text) {
    return 0
  }
  return Number.parseInt(text, 8) || 0
}

/**
 * Extracts USTAR tar entries into a path → bytes map (paths use `/`).
 * Suitable for npm `.tgz` layouts (`package/...`).
 */
export function extractUstarTarToMap(tar: Uint8Array): Map<string, Uint8Array> {
  const out = new Map<string, Uint8Array>()
  let offset = 0
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512)
    offset += 512
    const name = decodeTarString(header.subarray(0, 100))
    if (!name) {
      break
    }
    const prefix = decodeTarString(header.subarray(345, 500))
    const fullName = (prefix ? `${prefix}/${name}` : name).replace(/\\/g, '/')
    const size = parseOctal(header.subarray(124, 136))
    const typeflag = String.fromCharCode(header[156] ?? 0)
    if (typeflag === '0' || typeflag === '\0') {
      const content = tar.subarray(offset, offset + size)
      out.set(fullName, new Uint8Array(content))
    }
    offset += Math.ceil(size / 512) * 512
  }
  return out
}

/**
 * Gunzips when needed, then extracts USTAR tar. Used for npm `package.tgz` payloads.
 */
export function extractNpmTgzToMap(tgz: ArrayBuffer): Map<string, Uint8Array> {
  const raw = new Uint8Array(tgz)
  let tarData: Uint8Array
  try {
    tarData = gunzipSync(raw)
  } catch {
    tarData = raw
  }
  return extractUstarTarToMap(tarData)
}
