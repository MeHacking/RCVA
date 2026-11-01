import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiMode, apiModeLabel, startingScenario } from '../../src/api/apiMode'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('apiMode', () => {
  it('is the application on the device unless told otherwise', () => {
    vi.stubEnv('VITE_API_MODE', undefined)
    expect(apiMode()).toBe('local')
    vi.stubEnv('VITE_API_MODE', 'mock')
    expect(apiMode()).toBe('mock')
    vi.stubEnv('VITE_API_MODE', 'cloud')
    expect(() => apiMode()).toThrow('Unknown VITE_API_MODE "cloud". Allowed: mock, local, server')
  })
})

describe('startingScenario', () => {
  it('starts the device empty, the mock from "small", and either from a given scenario', () => {
    vi.stubEnv('VITE_MOCK_SCENARIO', undefined)
    expect(startingScenario('local')).toBeNull()
    expect(startingScenario('mock')).toBe('small')
    expect(startingScenario('server')).toBeNull()
    vi.stubEnv('VITE_MOCK_SCENARIO', 'proven')
    expect(startingScenario('local')).toBe('proven')
    expect(startingScenario('mock')).toBe('proven')
    expect(startingScenario('server')).toBeNull()
  })

  it('says in the sidebar when the device started from sample data', () => {
    expect(apiModeLabel('local', false)).toBe('Na uređaju')
    expect(apiModeLabel('local', true)).toBe('Na uređaju (probni početni podaci)')
    expect(apiModeLabel('mock', true)).toBe('Probni podaci (bez servera)')
    expect(apiModeLabel('server', false)).toBe('Podaci: server')
  })
})
