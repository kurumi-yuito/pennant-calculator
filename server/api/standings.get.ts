/**
 * NPB 公式サイトの試合結果ページを取得して、セ・パ両リーグの勝敗表を返す API。
 *
 * - 順位・勝敗・勝率・基準日の取得元は https://npb.jp/games/<year>/ のみ。
 *   他ページへのフォールバックは行わない。
 * - 残り直接対決数 (remainingHeadToHead) は、同じ npb.jp 内の月別日程・結果ページ
 *   (https://npb.jp/games/<year>/schedule_<MM>_detail.html) から、シーズン開幕〜基準日
 *   までの終了済みカードを集計して復元する（lib/parse-npb-schedule.ts, lib/head-to-head.ts）。
 *   NPB 公式以外のデータソースは使用しない。
 * - ブラウザから npb.jp を直接叩くと CORS で失敗するのでサーバ経由にする。
 * - 短時間（10 分）はメモリキャッシュを使い、正常表示を返す。
 * - 取得・解析・残り直接対決の復元検証のいずれかに失敗した場合、有効なキャッシュが無ければ
 *   502 を返す。古い（期限切れの）データを「最新」であるかのように返すことはしない
 *   （stale フォールバックは行わない）。remainingHeadToHead=null を通常運用の結果として
 *   返すこともしない（誤った最短ラインの表示を避けるため、失敗時は必ずエラーにする）。
 * - 試合中の途中経過は含まれない（順位表は確定済みの成績のみ）。
 */
import { parseGamesPageStandings } from '~/lib/parse-npb-standings'
import { parseScheduleMonthHtml } from '~/lib/parse-npb-schedule'
import { deriveRemainingHeadToHead } from '~/lib/head-to-head'
import type { CompletedGame } from '~/lib/parse-npb-schedule'
import type { LeagueStandings, StandingsPayload } from '~/lib/types'

const FRESH_TTL_MS = 10 * 60 * 1000
const FETCH_TIMEOUT_MS = 8000

/** NPB 公式戦の開幕は例年 3 月下旬（2026 年度は 3/27）。月別日程ページはこの月から取得すれば十分 */
const SEASON_START_MONTH = 3

let cache: { payload: StandingsPayload; at: number } | null = null

function seasonYear(now: Date): number {
  const override = Number(process.env.NUXT_PUBLIC_SEASON ?? process.env.NPB_SEASON)
  if (Number.isInteger(override) && override > 2000) return override
  // 1〜2 月は前年シーズンの成績しか存在しないため前年を見る
  return now.getUTCMonth() < 2 ? now.getUTCFullYear() - 1 : now.getUTCFullYear()
}

async function fetchText(url: string): Promise<string> {
  const html = await $fetch<string>(url, {
    responseType: 'text',
    timeout: FETCH_TIMEOUT_MS,
    headers: {
      'User-Agent': 'pennant-calculator/1.0 (+NPB standings viewer)',
      'Accept-Language': 'ja',
    },
  })
  if (typeof html !== 'string' || html.length < 500) {
    throw new Error(`${url}: レスポンスが不正です`)
  }
  return html
}

async function fetchStandingsTables(year: number): Promise<[LeagueStandings, LeagueStandings]> {
  const url = `https://npb.jp/games/${year}/`
  const html = await fetchText(url)
  return parseGamesPageStandings(html, url, year)
}

/** asOfDate (YYYY-MM-DD) の月まで、シーズン開幕月から月別日程ページを並行取得して解析する */
async function fetchCompletedGames(year: number, asOfDates: (string | null)[]): Promise<CompletedGame[]> {
  const months = asOfDates
    .filter((d): d is string => d !== null)
    .map((d) => Number(d.slice(5, 7)))
  const endMonth = Math.max(SEASON_START_MONTH, ...months)

  const monthNumbers = Array.from(
    { length: endMonth - SEASON_START_MONTH + 1 },
    (_, i) => SEASON_START_MONTH + i,
  )
  const perMonth = await Promise.all(
    monthNumbers.map(async (month) => {
      const mm = String(month).padStart(2, '0')
      const url = `https://npb.jp/games/${year}/schedule_${mm}_detail.html`
      const html = await fetchText(url)
      return parseScheduleMonthHtml(html, month, year)
    }),
  )
  return perMonth.flat()
}

async function fetchStandings(year: number): Promise<StandingsPayload> {
  const [central, pacific] = await fetchStandingsTables(year)
  const completedGames = await fetchCompletedGames(year, [central.asOfDate, pacific.asOfDate])

  const leagues = [central, pacific].map((league) => {
    if (!league.asOfDate) {
      throw new Error(`${league.league}: 基準日が取得できていないため残り直接対決を復元できません`)
    }
    return {
      ...league,
      remainingHeadToHead: deriveRemainingHeadToHead(completedGames, league.teams, league.asOfDate),
    }
  })

  return {
    fetchedAt: new Date().toISOString(),
    leagues,
  }
}

export default defineEventHandler(async (): Promise<StandingsPayload> => {
  const now = Date.now()
  if (cache && now - cache.at < FRESH_TTL_MS) {
    return cache.payload
  }
  const year = seasonYear(new Date(now))
  try {
    const payload = await fetchStandings(year)
    cache = { payload, at: now }
    return payload
  } catch (error) {
    console.error('[standings] 取得に失敗しました', error)
    throw createError({
      statusCode: 502,
      statusMessage: 'NPB standings fetch failed',
      message: '最新の勝敗表を取得できませんでした。',
    })
  }
})
