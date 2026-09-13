/**
 * NPB 公式サイトの試合結果ページ (https://npb.jp/games/<year>/) 内に埋め込まれた
 * 「<year>年 勝敗表」（セ・リーグ／パ・リーグ）の 2 テーブルを解析する。
 *
 * このページを唯一のデータ取得元とする（他ページへのフォールバックは行わない）。
 * 取得する項目は 試合・勝・敗・分・勝率・差 と、リーグごとの「○月○日現在」のみ。
 *
 * 重要な制約: このページには（旧 std_c.html / std_p.html にあった）
 * 「対神」「対巨」…のような直接対決の内訳列が存在しない。
 * そのため本パーサーは remainingHeadToHead を常に null として返す
 * （＝残りの直接対決日程は「不明」として扱う）。
 * lib/scenario.ts はこの「不明」状態を安全側に処理できるよう設計されているため、
 * シーズンの時期（交流戦の前後など）によって挙動が変わることはない。
 * 詳細は README の「残り直接対決について」を参照。
 *
 * - DOM ライブラリに依存しない（Cloudflare Workers でも動くように正規表現のみ）。
 * - HTML 構造が変わった / 値が欠けた場合は例外を投げ、呼び出し側でエラー表示に倒す。
 */
import { TOTAL_GAMES, findTeamByOfficialName } from './teams'
import { winningPercentage } from './record'
import type { LeagueId, LeagueStandings, TeamStanding } from './types'

export class StandingsParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'StandingsParseError'
  }
}

function stripTags(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

function toInt(text: string, label: string): number {
  const matched = text.match(/-?\d+/)
  if (!matched) throw new StandingsParseError(`${label} を数値として解析できません: "${text}"`)
  const value = Number.parseInt(matched[0], 10)
  if (!Number.isFinite(value)) throw new StandingsParseError(`${label} が数値ではありません: "${text}"`)
  return value
}

const SECTION_MARKER: Record<LeagueId, string> = {
  central: 'standings_wrap_c',
  pacific: 'standings_wrap_p',
}

const LEAGUE_LABEL_TEXT: Record<LeagueId, string> = {
  central: 'セ・リーグ',
  pacific: 'パ・リーグ',
}

/**
 * 「standings_wrap_c」「standings_wrap_p」マーカー以降の最初の <time> と <table> を取り出す。
 * 2 つのリーグ表は同じ構造で並んでいるため、開始マーカーからの相対位置だけで一意に特定できる。
 */
function extractSection(html: string, league: LeagueId): { asOfText: string; table: string } {
  const marker = SECTION_MARKER[league]
  const markerIndex = html.indexOf(marker)
  if (markerIndex < 0) {
    throw new StandingsParseError(`${LEAGUE_LABEL_TEXT[league]}の勝敗表セクションが見つかりません（"${marker}"）`)
  }
  const rest = html.slice(markerIndex)

  const timeMatch = rest.match(/<time[^>]*>([\s\S]*?)<\/time>/)
  if (!timeMatch) {
    throw new StandingsParseError(`${LEAGUE_LABEL_TEXT[league]}の「○月○日現在」が見つかりません`)
  }

  const tableMatch = rest.match(/<table[^>]*>[\s\S]*?<\/table>/)
  if (!tableMatch) {
    throw new StandingsParseError(`${LEAGUE_LABEL_TEXT[league]}の勝敗表テーブルが見つかりません`)
  }

  return { asOfText: stripTags(timeMatch[1]), table: tableMatch[0] }
}

/** 「9月12日現在」+ シーズン年 → asOfLabel / asOfDate */
function parseAsOf(asOfText: string, seasonYear: number, league: LeagueId): { label: string; date: string } {
  const matched = asOfText.match(/(\d{1,2})月\s*(\d{1,2})日\s*現在/)
  if (!matched) {
    throw new StandingsParseError(`${LEAGUE_LABEL_TEXT[league]}の「○月○日現在」を解析できません: "${asOfText}"`)
  }
  const [, m, d] = matched
  const pad = (v: string) => v.padStart(2, '0')
  return {
    label: `${seasonYear}年${Number(m)}月${Number(d)}日`,
    date: `${seasonYear}-${pad(m)}-${pad(d)}`,
  }
}

/**
 * 1 リーグ分の勝敗表テーブルを解析する。
 * ヘッダ: (空) / 試合 / 勝 / 敗 / 分 / 勝率 / 差
 * 行: <th>球団名(hide_sp / hide_pc)</th><td>試合</td>...<td class="gb">差</td>
 */
function parseTable(table: string, league: LeagueId): TeamStanding[] {
  const theadMatch = table.match(/<thead[^>]*>([\s\S]*?)<\/thead>/)
  if (!theadMatch) throw new StandingsParseError(`${LEAGUE_LABEL_TEXT[league]}: ヘッダ (thead) が見つかりません`)
  const headers = [...theadMatch[1].matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map((m) => stripTags(m[1]))
  if (headers.length === 0) throw new StandingsParseError(`${LEAGUE_LABEL_TEXT[league]}: ヘッダを取得できません`)

  const col = {
    games: headers.findIndex((h) => h === '試合'),
    wins: headers.findIndex((h) => h === '勝'),
    losses: headers.findIndex((h) => h === '敗'),
    ties: headers.findIndex((h) => h === '分'),
    pct: headers.findIndex((h) => h === '勝率'),
    gb: headers.findIndex((h) => h === '差'),
  }
  const requiredColumns: [keyof typeof col, string][] = [
    ['games', '試合'],
    ['wins', '勝'],
    ['losses', '敗'],
    ['ties', '分'],
    ['pct', '勝率'],
    ['gb', '差'],
  ]
  for (const [key, label] of requiredColumns) {
    if (col[key] < 0) throw new StandingsParseError(`${LEAGUE_LABEL_TEXT[league]}: 「${label}」列が見つかりません`)
  }

  const tbodyMatch = table.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/)
  if (!tbodyMatch) throw new StandingsParseError(`${LEAGUE_LABEL_TEXT[league]}: 本体 (tbody) が見つかりません`)
  const rows = [...tbodyMatch[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)]
  if (rows.length !== 6) {
    throw new StandingsParseError(`${LEAGUE_LABEL_TEXT[league]}: 球団の行数が想定と異なります (${rows.length})`)
  }

  const teams: TeamStanding[] = []
  for (const row of rows) {
    // 先頭は球団名の <th>、残り 6 列は <td>。出現順を保つため th/td をまとめて拾う。
    const cells = [...row[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map((m) => m[1])
    if (cells.length !== headers.length) {
      throw new StandingsParseError(
        `${LEAGUE_LABEL_TEXT[league]}: 列数が一致しません (th=${headers.length}, 行=${cells.length})`,
      )
    }

    const nameCellHtml = cells[0]
    const fullNameMatch = nameCellHtml.match(/<span class="hide_sp">([\s\S]*?)<\/span>/)
    if (!fullNameMatch) {
      throw new StandingsParseError(`${LEAGUE_LABEL_TEXT[league]}: 球団名 (hide_sp) が見つかりません`)
    }
    const fullName = stripTags(fullNameMatch[1])
    const team = findTeamByOfficialName(fullName, league)
    if (!team) throw new StandingsParseError(`未知の球団名です: "${fullName}"`)

    const textCells = cells.map((c) => stripTags(c))
    const games = toInt(textCells[col.games], '試合')
    const wins = toInt(textCells[col.wins], '勝')
    const losses = toInt(textCells[col.losses], '敗')
    const ties = toInt(textCells[col.ties], '分')
    if (wins + losses + ties !== games) {
      throw new StandingsParseError(`${team.name}: 勝敗分の合計が試合数と一致しません`)
    }
    if (games < 0 || games > TOTAL_GAMES) {
      throw new StandingsParseError(`${team.name}: 試合数が異常です (${games})`)
    }

    // 表示値ではなく再計算した勝率を使う。表示値とのズレはレイアウト崩れの検知にだけ使う。
    const pct = winningPercentage(wins, losses)
    const shownPct = Number.parseFloat(textCells[col.pct])
    if (Number.isFinite(shownPct) && Math.abs(shownPct - pct) > 0.002) {
      throw new StandingsParseError(`${team.name}: 勝率が一致しません (表示 ${textCells[col.pct]} / 計算 ${pct})`)
    }

    const gbText = textCells[col.gb].replace(/\s/g, '')
    const gbValue = /^-+$/.test(gbText) ? 0 : Number.parseFloat(gbText)
    teams.push({
      teamId: team.id,
      teamName: team.name,
      league,
      games,
      wins,
      losses,
      ties,
      winningPercentage: pct,
      gamesBehind: Number.isFinite(gbValue) ? gbValue : null,
    })
  }
  return teams
}

/**
 * https://npb.jp/games/<year>/ の HTML から、セ・パ両リーグの勝敗表を解析する。
 * このページには直接対決の内訳が無いため、remainingHeadToHead は常に null。
 */
export function parseGamesPageStandings(
  html: string,
  sourceUrl: string,
  seasonYear: number,
): [LeagueStandings, LeagueStandings] {
  const leagues: LeagueId[] = ['central', 'pacific']
  const results = leagues.map((league) => {
    const { asOfText, table } = extractSection(html, league)
    const teams = parseTable(table, league)
    const { label, date } = parseAsOf(asOfText, seasonYear, league)
    const standings: LeagueStandings = {
      league,
      // この時点では差分反映前なので、asOfLabel/asOfDate と sourceAsOfLabel/sourceAsOfDate は
      // 同じ値になる。差分反映（server/api/standings.get.ts）が行われた場合、呼び出し側が
      // asOfLabel/asOfDate/isPartialDay のみを上書きする（sourceAsOf* はここでの値を維持する）。
      asOfLabel: label,
      asOfDate: date,
      sourceAsOfLabel: label,
      sourceAsOfDate: date,
      isPartialDay: false,
      teams,
      remainingHeadToHead: null,
      sourceUrl,
    }
    return standings
  })
  return [results[0], results[1]]
}
