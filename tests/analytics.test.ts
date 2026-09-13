import { afterEach, describe, expect, it, vi } from 'vitest'
import { useAnalytics } from '../composables/useAnalytics'

afterEach(() => vi.unstubAllGlobals())

describe('useAnalytics', () => {
  it('does nothing during SSR without window', () => {
    vi.stubGlobal('window', undefined)
    expect(() => useAnalytics().track('result_view')).not.toThrow()
  })

  it('does nothing when gtag is unavailable', () => {
    vi.stubGlobal('window', {})
    expect(() => useAnalytics().track('team_select')).not.toThrow()
  })

  it('sends the event and its unchanged parameters', () => {
    const gtag = vi.fn()
    vi.stubGlobal('window', { gtag })
    const params = { team: 'baystars', league: 'central', championship_possible: true }
    useAnalytics().track('team_select', params)
    expect(gtag).toHaveBeenCalledExactlyOnceWith('event', 'team_select', params)
  })

  it('does not interrupt the app if the analytics tag throws', () => {
    vi.stubGlobal('window', { gtag: () => { throw new Error('Unavailable') } })
    expect(() => useAnalytics().track('share_x_click')).not.toThrow()
  })
})
