type AnalyticsParams = Record<string, string | number | boolean | undefined>

/** 計測の有無や失敗で、表示・保存・共有処理を妨げない。 */
export function useAnalytics() {
  const track = (eventName: string, params: AnalyticsParams = {}) => {
    if (import.meta.server || typeof window === 'undefined') return

    const gtag = (window as typeof window & {
      gtag?: (...args: unknown[]) => void
    }).gtag
    if (typeof gtag !== 'function') return

    try {
      gtag('event', eventName, params)
    } catch {
      // Analytics が利用できなくても、アプリの操作は継続する。
    }
  }

  return { track }
}
