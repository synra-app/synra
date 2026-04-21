export function normalizeHost(value: string | undefined): string {
  if (typeof value !== 'string') {
    return ''
  }
  const trimmed = value.trim().toLowerCase()
  const withoutPrefix = trimmed.startsWith('::ffff:') ? trimmed.slice('::ffff:'.length) : trimmed
  const withoutSlash = withoutPrefix.startsWith('/') ? withoutPrefix.slice(1) : withoutPrefix
  if (withoutSlash.startsWith('[') && withoutSlash.endsWith(']')) {
    return withoutSlash.slice(1, -1)
  }
  return withoutSlash
}

export function normalizeHostKey(host: string | undefined, port: number | undefined): string {
  if (typeof port !== 'number') {
    return ''
  }
  const normalizedHost = normalizeHost(host)
  if (normalizedHost.length === 0) {
    return ''
  }
  return `${normalizedHost}:${String(port)}`
}
