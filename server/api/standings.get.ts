/**
 * NPB 公式サイトの試合結果ページを取得して、セ・パ両リーグの勝敗表を返す API。
 *
 * - 順位・勝敗・勝率・基準日の取得元は https://npb.jp/games/<year>/ のみ。
 *   他ページへのフォールバックは行わない。
 * - 残り直接対決数 (remainingHeadToHead) は、同じ npb.jp 内の月別日程・結果ページ
 *   (https://npb.jp/games/<year>/schedule_<MM>_detail.html) から、シーズン開幕〜基準日
 *   までの終了済みカードを集計して復元する（lib/parse-npb-schedule.ts, lib/head-to-head.ts）。
 *   NPB 公式以外のデータソースは使用しない。
 *
 * - 勝敗表ページ（「○年 勝敗表」）自体は、当日の試合が終了していても、しばらく前日時点の
 *   まま更新されないことがある。そこで、勝敗表の基準日（sourceAsOfDate）より後・当日（JST）
 *   までの NPB 公式試合結果を確認し、未反映分だけを勝敗表へ差分適用して最新状態を
 *   再構築する（lib/standings-diff.ts）。優勝・CS・5割ラインの計算ロジック（lib/scenario.ts）
 *   自体は変更しない — この API はあくまで「最新 standings を作る層」であり、その結果を
 *   従来どおり lib/scenario.ts に渡すだけ。
 *   差分適用後の実効基準日は asOfLabel/asOfDate に入れ、勝敗表ページ自身の基準日は
 *   sourceAsOfLabel/sourceAsOfDate に残す。当日の試合がまだ全部終わっていない可能性が
 *   あれば isPartialDay=true にする（詳細は lib/types.ts）。
 * - 差分の元データは、同じ npb.jp 内の月別日程・結果ページ (schedule_<MM>_detail.html) に
 *   加えて、npb.jp トップページ (https://npb.jp/) のヘッダー速報スコアボードも使う。
 *   実データで確認したところ、月別日程ページも勝敗表と同程度に更新が遅れることがあり
 *   （2026-09-13: 勝敗表・月別日程ページの双方が「9/12現在」のまま、しかしトップページの
 *   速報は 9/13 の試合を試合終了として表示済みだった）、月別日程ページだけでは当日の
 *   終了済み試合を拾いきれないケースがあるため。トップページも npb.jp 自身のページであり、
 *   他サイトへのフォールバックではない（lib/parse-npb-live-scores.ts）。
 *   両ソースの結果は (日付, 対戦カード) で重複排除して 1 つの一覧にまとめる
 *   （同じ試合を二重に加算しないため）。
 * - 残り直接対決数は、差分適用後の実効基準日（asOfDate）を基準に復元する。これにより
 *   「試合数 (games) が +1 されたのに、直接対決の消化数はそのまま」という矛盾が起きない。
 *
 * - ブラウザから npb.jp を直接叩くと CORS で失敗するのでサーバ経由にする。
 * - 短時間（10 分）はメモリキャッシュを使い、正常表示を返す。キャッシュするのは
 *   差分適用まで完了した「統合済み」の結果であり、勝敗表の生データだけをキャッシュして
 *   差分が古びたまま返ることはない。
 * - 取得・解析・差分適用・残り直接対決の復元検証のいずれかに失敗した場合、有効なキャッシュが
 *   無ければ 502 を返す。古い（期限切れの）データを「最新」であるかのように返すことはしない
 *   （stale フォールバックは行わない）。remainingHeadToHead=null を通常運用の結果として
 *   返すこともしない（誤った最短ラインの表示を避けるため、失敗時は必ずエラーにする）。
 * - 試合中の途中経過は含まれない（順位表は確定済みの成績のみ）。
 */
import { parseGamesPageStandings } from '~/lib/parse-npb-standings'
import { parseScheduleMonthRows } from '~/lib/parse-npb-schedule'
import { parseLiveScoreboardHtml } from '~/lib/parse-npb-live-scores'
import { deriveRemainingHeadToHead } from '~/lib/head-to-head'
import { applyStandingsDiff, finishedGamesFrom, hasUnfinishedGameOn, mergeScheduleRows } from '~/lib/standings-diff'
import type { CompletedGame, ScheduleRow } from '~/lib/parse-npb-schedule'
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

/** JST での「今日」を YYYY-MM-DD で返す（当日差分反映の上限日付として使う） */
function todayInJst(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
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

/**
 * シーズン開幕月から、asOfDate（勝敗表の基準日）と当日（JST）のうち遅い方の月まで、
 * 月別日程・結果ページを並行取得し、行データ（終了済み/未開催/中止すべて）を返す。
 * 当日分まで含めるのは、勝敗表がまだ反映していない直近の試合結果を拾うため。
 */
async function fetchScheduleRows(
  year: number,
  asOfDates: (string | null)[],
  throughDate: string,
): Promise<ScheduleRow[]> {
  const months = [
    ...asOfDates.filter((d): d is string => d !== null).map((d) => Number(d.slice(5, 7))),
    Number(throughDate.slice(5, 7)),
  ]
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
      return parseScheduleMonthRows(html, month, year)
    }),
  )
  return perMonth.flat()
}

/** npb.jp トップページのヘッダー速報スコアボードを取得・解析する */
async function fetchLiveScoreboardRows(): Promise<ScheduleRow[]> {
  const html = await fetchText('https://npb.jp/')
  return parseLiveScoreboardHtml(html)
}

async function fetchStandings(year: number, now: Date): Promise<StandingsPayload> {
  const [central, pacific] = await fetchStandingsTables(year)
  const throughDate = todayInJst(now)
  const [scheduleRows, liveRows] = await Promise.all([
    fetchScheduleRows(year, [central.asOfDate, pacific.asOfDate], throughDate),
    fetchLiveScoreboardRows(),
  ])
  // 月別日程ページ側を優先し、トップページ速報にしか無い（＝月別日程ページがまだ
  // 反映していない）行だけを補って二重加算を防ぐ（lib/standings-diff.ts）。
  const rows = mergeScheduleRows(scheduleRows, liveRows)
  const finishedGames = finishedGamesFrom(rows)

  const leagues = [central, pacific].map((league) => {
    if (!league.asOfDate) {
      throw new Error(`${league.league}: 基準日が取得できていないため残り直接対決を復元できません`)
    }

    // 1. 勝敗表の基準日より後・当日までの NPB 公式試合結果のうち、未反映分だけを適用する
    //    （二重加算防止: applyStandingsDiff は date > sourceAsOfDate の試合のみを対象にする）。
    const diff = applyStandingsDiff(league.teams, finishedGames, league.asOfDate, throughDate)
    const effectiveAsOfDate = diff.effectiveAsOfDate
    const isPartialDay = effectiveAsOfDate === throughDate && hasUnfinishedGameOn(rows, effectiveAsOfDate)
    const effectiveAsOfLabel =
      effectiveAsOfDate === league.asOfDate
        ? league.asOfLabel
        : `${Number(effectiveAsOfDate.slice(0, 4))}年${Number(effectiveAsOfDate.slice(5, 7))}月${Number(effectiveAsOfDate.slice(8, 10))}日`

    // 2. 残り直接対決数は、差分適用後の実効基準日（games が+1された後の状態）に合わせて
    //    復元する。これにより games / completedHeadToHead / remainingHeadToHead の整合性を保つ。
    //    h2h 集計には CompletedGame（date/teamA/teamB のみ）で十分なので、スコア付きの
    //    ScheduleRow から必要な形へ変換するだけで、lib/head-to-head.ts 自体は変更しない。
    const completedGames: CompletedGame[] = rows
      .filter((r): r is ScheduleRow & { teamA: string; teamB: string } => r.status === 'finished' && r.teamA !== null && r.teamB !== null)
      .map((r) => ({ date: r.date, teamA: r.teamA, teamB: r.teamB }))

    return {
      ...league,
      teams: diff.teams,
      asOfLabel: effectiveAsOfLabel,
      asOfDate: effectiveAsOfDate,
      isPartialDay,
      remainingHeadToHead: deriveRemainingHeadToHead(completedGames, diff.teams, effectiveAsOfDate),
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
  const nowDate = new Date(now)
  const year = seasonYear(nowDate)
  try {
    const payload = await fetchStandings(year, nowDate)
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
