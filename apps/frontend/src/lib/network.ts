export function isIpv4Address(value: string | undefined): boolean {
  if (typeof value !== 'string') {
    return false
  }
  const segments = value.trim().split('.')
  if (segments.length !== 4) {
    return false
  }
  return segments.every(
    (segment) => /^\d{1,3}$/.test(segment) && Number(segment) >= 0 && Number(segment) <= 255
  )
}
