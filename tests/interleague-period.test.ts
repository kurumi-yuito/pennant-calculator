/**
 * 交流戦期間中（＝まだ交流戦を消化しきっていない時期）の勝敗表でも、
 * パーサーおよびシナリオ計算全体が壊れないことを確認する。
 *
 * `parseGamesPageStandings`（勝敗表ページのみを解析する関数）は、その性質上
 * 直接対決の内訳を持たないため常に remainingHeadToHead = null を返す。
 * 実際のアプリでは、この null は `lib/head-to-head.ts` が月別日程ページから
 * 復元した本物の残り直接対決数で置き換えられる（server/api/standings.get.ts）。
 * その復元ロジックが交流戦前後を問わず正しく動くことは
 * tests/head-to-head.test.ts の「交流戦前後」ブロックで検証している。
 *
 * ここで確認したいのは、その復元に失敗した場合の安全側フォールバック
 * （remainingHeadToHead = null）を lib/scenario.ts が交流戦期間特有の
 * 「リーグ内の残り試合合計が 143 − 消化試合数 と一致しない」という
 * 状態でも例外を出さずに扱えること。
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parseGamesPageStandings } from '../lib/parse-npb-standings'
import { TOTAL_GAMES } from '../lib/teams'
import { calcFiveHundredLine, calcRankLines, currentRank, remainingGames } from '../lib/scenario'

const fixture = (name: string) =>
  readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), 'utf-8')

const earlySeasonHtml = fixture('games-2026-interleague-period.html')
const SOURCE_URL = 'https://npb.jp/games/2026/'

describe('交流戦期間（シーズン序盤）の勝敗表 — 勝敗表のみの解析', () => {
  const [central, pacific] = parseGamesPageStandings(earlySeasonHtml, SOURCE_URL, 2026)

  it('例外を投げずに解析できる', () => {
    expect(central.teams).toHaveLength(6)
    expect(pacific.teams).toHaveLength(6)
  })

  it('「6月10日現在」を正しく取得する', () => {
    expect(central.asOfLabel).toBe('2026年6月10日')
    expect(central.asOfDate).toBe('2026-06-10')
  })

  it('この時期は残り試合数がまだ100を大きく超えている（交流戦がまだ残っている）', () => {
    for (const team of central.teams) {
      const remaining = remainingGames(team)
      expect(remaining).toBe(TOTAL_GAMES - team.games)
      // 30試合前後の消化であれば、残りは100試合を超える
      expect(remaining).toBeGreaterThan(100)
    }
  })

  it('勝敗表ページ単体の解析では remainingHeadToHead は常に null', () => {
    expect(central.remainingHeadToHead).toBeNull()
    expect(pacific.remainingHeadToHead).toBeNull()
  })

  it('h2h=null（復元失敗時の安全側フォールバック）でも全球団でシナリオ計算が例外・NaN を出さずに完走する', () => {
    for (const standings of [central, pacific]) {
      for (const team of standings.teams) {
        const rank = currentRank(standings, team.teamId)
        const pennant = calcRankLines(standings, team.teamId, 1)
        const cs = calcRankLines(standings, team.teamId, 3)
        const five = calcFiveHundredLine(team)

        expect(rank).not.toBeNull()
        expect(pennant).not.toBeNull()
        expect(cs).not.toBeNull()
        expect(pennant?.headToHeadKnown).toBe(false)
        expect(cs?.headToHeadKnown).toBe(false)

        for (const value of [team.winningPercentage, five.finalPercentage, five.currentPercentage]) {
          expect(Number.isFinite(value)).toBe(true)
        }
        for (const value of [pennant?.possibleWins, pennant?.clinchWins, cs?.possibleWins, cs?.clinchWins, five.requiredWins]) {
          expect(value === null || value === undefined || Number.isInteger(value)).toBe(true)
        }
      }
    }
  })
})
