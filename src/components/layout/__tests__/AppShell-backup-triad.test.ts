/**
 * Smoke tests for the AppShell store backup triad (Bug #7 hotfix, 2026-04-19).
 *
 * Before the fix, chat history could be lost when an NSIS update killed the
 * app between backup intervals. The triad is:
 *   1. 10s safety-net interval (was 30s)
 *   2. chatStore.subscribe → debounced backup on any mutation
 *   3. beforeunload sync flush for graceful quits
 *
 * These tests read the source so we catch accidental regressions that would
 * quietly revert any of the three.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const src = readFileSync(join(__dirname, '../AppShell.tsx'), 'utf8')

describe('AppShell backup triad (Bug #7)', () => {
  it('runs the safety-net interval every 10 seconds (not 30 or longer)', () => {
    expect(src).toContain('setInterval(doBackup, 10_000)')
    // Make sure the old 30s value is really gone.
    expect(src).not.toContain('setInterval(doBackup, 30_000)')
  })

  it('subscribes to chatStore for event-driven backup', () => {
    expect(src).toContain('useChatStore.subscribe')
    expect(src).toContain('scheduleBackup')
  })

  it('debounces event-driven backups with a setTimeout to coalesce bursts', () => {
    expect(src).toContain('debounceTimer')
    expect(src).toMatch(/setTimeout\(doBackup,\s*1_?000\)/)
  })

  it('flushes a final backup on beforeunload (graceful quit)', () => {
    expect(src).toContain("addEventListener('beforeunload'")
    expect(src).toContain('onBeforeUnload')
  })

  it('cleans up all three hooks in the useEffect return', () => {
    // Regression guard: the return() block must clear interval, debounce,
    // subscription, and event listener.
    expect(src).toContain('clearInterval(interval)')
    expect(src).toContain('unsubChat()')
    expect(src).toContain("removeEventListener('beforeunload'")
    expect(src).toContain('clearTimeout(debounceTimer)')
  })

  it('writes the restore-complete sentinel only when snapshot has entries', () => {
    // Otherwise an empty fresh install would write the sentinel and block
    // the next startup's restore attempt.
    expect(src).toContain('Object.keys(snapshot).length > 0')
    // The backup-path sentinel-set must come AFTER the length-check (guarded by it).
    // Note: there's also a restore-path sentinel write (line ~76) — we only
    // care that at least one occurrence lives after the length guard.
    const idxLenCheck = src.indexOf('Object.keys(snapshot).length > 0')
    const allSentinelWrites = [...src.matchAll(/localStorage\.setItem\('lu-restore-complete'/g)]
    const guardedByLenCheck = allSentinelWrites.some(m => (m.index ?? 0) > idxLenCheck)
    expect(guardedByLenCheck).toBe(true)
  })
})
