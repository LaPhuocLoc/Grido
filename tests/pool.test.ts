// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { poolSize } from '../src/lib/imaging/tasks'

describe('poolSize', () => {
  it('runs a single worker on low-memory devices', () => {
    expect(poolSize(4, 16)).toBe(1)
    expect(poolSize(2, 4)).toBe(1)
  })

  it('never drops below one worker', () => {
    expect(poolSize(8, 1)).toBe(1)
    expect(poolSize(32, 2)).toBe(1)
  })

  it('keeps small machines at up to three workers', () => {
    expect(poolSize(8, 4)).toBe(3)
    expect(poolSize(6, 20)).toBe(3)
  })

  it('opens more workers on bigger machines, leaving two cores free', () => {
    expect(poolSize(8, 6)).toBe(4)
    expect(poolSize(8, 20)).toBe(6)
    expect(poolSize(16, 8)).toBe(6)
    expect(poolSize(32, 20)).toBe(8)
  })
})
