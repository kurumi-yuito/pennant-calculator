import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { StandingsParseError, parseGamesPageStandings } from '../lib/parse-npb-standings'
import { TOTAL_GAMES } from '../lib/teams'

const fixture = (name: string) =>
  readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), 'utf-8')

const gamesHtml = fixture('games-2026-2026-09-12.html')
const SOURCE_URL = 'https://npb.jp/games/2026/'

describe('parseGamesPageStandings (セ・リーグ)', () => {
  const [central] = parseGamesPageStandings(gamesHtml, SOURCE_URL, 2026)

  it('「○年○月○日 現在」を取得する', () => {
    expect(central.asOfLabel).toBe('2026年9月12日')
    expect(central.asOfDate).toBe('2026-09-12')
  })

  it('sourceUrl は games/2026 ページのみ', () => {
    expect(central.sourceUrl).toBe(SOURCE_URL)
  })

  it('6球団を公式値どおりに取得する', () => {
    expect(central.teams).toHaveLength(6)
    const tigers = central.teams[0]
    expect(tigers).toMatchObject({
      teamId: 'tigers',
      teamName: '阪神タイガース',
      league: 'central',
      games: 124,
      wins: 69,
      losses: 54,
      ties: 1,
      gamesBehind: 0,
    })
    expect(tigers.winningPercentage).toBeCloseTo(69 / 123, 9)
  })

  it('最下位の球団まで正しく読む', () => {
    const carp = central.teams.find((t) => t.teamId === 'carp')
    expect(carp).toMatchObject({ games: 123, wins: 50, losses: 69, ties: 4, gamesBehind: 17 })
  })

  it('全球団で 勝+敗+分 = 試合数', () => {
    for (const team of central.teams) {
      expect(team.wins + team.losses + team.ties).toBe(team.games)
      expect(team.games).toBeLessThanOrEqual(TOTAL_GAMES)
    }
  })

  it('この勝敗表ページ自体には直接対決の内訳が無いため、この関数では remainingHeadToHead は null', () => {
    // 実際の残り直接対決の復元は lib/head-to-head.ts が別途、月別日程ページから行う
    // （tests/head-to-head.test.ts）。この関数（勝敗表のみの解析）の責務では常に null。
    expect(central.remainingHeadToHead).toBeNull()
  })
})

describe('parseGamesPageStandings (パ・リーグ)', () => {
  const [, pacific] = parseGamesPageStandings(gamesHtml, SOURCE_URL, 2026)

  it('セ・リーグと同じ日付、6球団を取得する', () => {
    expect(pacific.asOfLabel).toBe('2026年9月12日')
    expect(pacific.teams).toHaveLength(6)
    const hawks = pacific.teams[0]
    expect(hawks).toMatchObject({ teamId: 'hawks', games: 128, wins: 80, losses: 45, ties: 3 })
  })

  it('最下位の球団まで正しく読む', () => {
    const eagles = pacific.teams.find((t) => t.teamId === 'eagles')
    expect(eagles).toMatchObject({ games: 126, wins: 47, losses: 78, ties: 1 })
  })

  it('こちらもこの関数では remainingHeadToHead は null', () => {
    expect(pacific.remainingHeadToHead).toBeNull()
  })
})

describe('parseGamesPageStandings の異常系', () => {
  it('セクション自体が無ければ例外を投げる', () => {
    expect(() => parseGamesPageStandings('<html><body>メンテナンス中</body></html>', SOURCE_URL, 2026)).toThrow(
      StandingsParseError,
    )
  })

  it('テーブルが欠損していれば例外を投げる（テーブル欠損）', () => {
    const broken = gamesHtml.replace(/<table>[\s\S]*?<\/table>/, '')
    expect(() => parseGamesPageStandings(broken, SOURCE_URL, 2026)).toThrow(StandingsParseError)
  })

  it('行数が足りなければ例外を投げる（行不足）', () => {
    const broken = gamesHtml.replace(
      /<tr>\s*<th><span class="hide_sp">広島東洋カープ<\/span>[\s\S]*?<\/tr>/,
      '',
    )
    expect(() => parseGamesPageStandings(broken, SOURCE_URL, 2026)).toThrow(StandingsParseError)
  })

  it('必須カラムのヘッダが欠けていれば例外を投げる（カラム不正）', () => {
    const broken = gamesHtml.replace('<th>勝率</th>', '<th>謎</th>')
    expect(() => parseGamesPageStandings(broken, SOURCE_URL, 2026)).toThrow(StandingsParseError)
  })

  it('数値が欠けていれば例外を投げる', () => {
    const broken = gamesHtml.replace('<td>124</td>', '<td>-</td>')
    expect(() => parseGamesPageStandings(broken, SOURCE_URL, 2026)).toThrow(StandingsParseError)
  })

  it('未知の球団名なら例外を投げる', () => {
    const broken = gamesHtml.replace(
      '<span class="hide_sp">阪神タイガース</span>',
      '<span class="hide_sp">存在しない球団</span>',
    )
    expect(() => parseGamesPageStandings(broken, SOURCE_URL, 2026)).toThrow(StandingsParseError)
  })

  it('「○月○日現在」が読めなければ例外を投げる', () => {
    const broken = gamesHtml.replace('<time>9月12日現在</time>', '<time>更新中</time>')
    expect(() => parseGamesPageStandings(broken, SOURCE_URL, 2026)).toThrow(StandingsParseError)
  })
})
