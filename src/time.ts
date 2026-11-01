const ISO_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/

export function nowIso(): string {
  return new Date().toISOString()
}

export function isIsoTimestamp(value: string): boolean {
  return ISO_PATTERN.test(value) && !Number.isNaN(Date.parse(value))
}

export function dateStamp(date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}${month}${day}`
}

export function daysSince(iso: string): number {
  const then = Date.parse(iso)
  if (Number.isNaN(then)) return 0
  return Math.max(0, (Date.now() - then) / 86_400_000)
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
