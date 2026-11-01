import { randomBytes } from 'node:crypto'
import { dateStamp } from './time.js'

export function randomHex(bytes: number): string {
  return randomBytes(bytes).toString('hex')
}

export function newTaskId(): string {
  return `TSK-${dateStamp()}-${randomHex(3)}`
}

export function newPreflightId(): string {
  return `PF-${randomHex(4)}`
}

export function newCitationId(): string {
  return `CIT-${randomHex(6)}`
}

export function formatSequence(value: number, width = 6): string {
  return String(value).padStart(width, '0')
}
