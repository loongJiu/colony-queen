import { describe, it, expect } from 'vitest'
import { formatTimeAgo, formatDuration, formatPercent } from '../../src/utils/format.js'

describe('formatTimeAgo', () => {
  it('returns "-" for null/undefined/0', () => {
    expect(formatTimeAgo(null)).toBe('-')
    expect(formatTimeAgo(undefined)).toBe('-')
    expect(formatTimeAgo(0)).toBe('-')
  })

  it('returns "just now" for < 1s', () => {
    expect(formatTimeAgo(Date.now())).toBe('just now')
    expect(formatTimeAgo(Date.now() - 500)).toBe('just now')
  })

  it('returns seconds', () => {
    expect(formatTimeAgo(Date.now() - 5000)).toBe('5s ago')
  })

  it('returns minutes', () => {
    expect(formatTimeAgo(Date.now() - 120000)).toBe('2m ago')
  })

  it('returns hours', () => {
    expect(formatTimeAgo(Date.now() - 7200000)).toBe('2h ago')
  })

  it('returns days', () => {
    expect(formatTimeAgo(Date.now() - 172800000)).toBe('2d ago')
  })
})

describe('formatDuration', () => {
  it('returns "-" for null/undefined', () => {
    expect(formatDuration(null)).toBe('-')
    expect(formatDuration(undefined)).toBe('-')
  })

  it('formats milliseconds', () => {
    expect(formatDuration(500)).toBe('500ms')
  })

  it('formats seconds', () => {
    expect(formatDuration(1500)).toBe('1.5s')
    expect(formatDuration(500)).toBe('500ms')
  })

  it('formats minutes and seconds', () => {
    expect(formatDuration(125000)).toBe('2m 5s')
  })
})

describe('formatPercent', () => {
  it('returns "0%" for null/undefined', () => {
    expect(formatPercent(null)).toBe('0%')
    expect(formatPercent(undefined)).toBe('0%')
  })

  it('rounds and formats', () => {
    expect(formatPercent(33.6)).toBe('34%')
    expect(formatPercent(100)).toBe('100%')
    expect(formatPercent(0)).toBe('0%')
  })
})
