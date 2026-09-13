export type LeagueId = 'central' | 'pacific'

/** NPB 順位表 1 球団分の確定済み成績 */
export type TeamStanding = {
  teamId: string
  teamName: string
  league: LeagueId
  games: number
  wins: number
  losses: number
  ties: number
  winningPercentage: number
  gamesBehind: number | null
}

/** 残り直接対決数。remainingHeadToHead[teamId][opponentId] */
export type RemainingHeadToHead = Record<string, Record<string, number>>

export type LeagueStandings = {
  league: LeagueId
  /**
   * 実効の基準日ラベル（「○年○月○日」）。
   * 勝敗表ページ自体の基準日（sourceAsOfLabel）より後に終了した NPB 公式試合結果が
   * あれば、それを差分反映した後の最新日付になる（server/api/standings.get.ts）。
   * 差分反映が無ければ sourceAsOfLabel と同じ。UI はこちらを表示する。
   */
  asOfLabel: string
  /** asOfLabel を ISO 日付 (YYYY-MM-DD) にしたもの。解析できなければ null */
  asOfDate: string | null
  /** 勝敗表ページ (https://npb.jp/games/<year>/) 自体の「○年○月○日 現在」（差分反映前・未加工） */
  sourceAsOfLabel: string
  /** sourceAsOfLabel を ISO 日付にしたもの */
  sourceAsOfDate: string | null
  /**
   * asOfDate の時点で、その日の試合がまだ全部終了していない可能性がある場合 true。
   * （＝終了済みの試合だけを反映しているが、同日にまだ結果が出ていない試合が残っている）
   */
  isPartialDay: boolean
  teams: TeamStanding[]
  /**
   * 残り直接対決数。
   * 勝敗表ページ (https://npb.jp/games/<year>/) 自体には直接対決の内訳が無いため、
   * `parseGamesPageStandings()` はここを常に null で返す。実際の値は
   * `lib/head-to-head.ts` の `deriveRemainingHeadToHead()` が、月別日程・結果ページから
   * 集計した終了済みカード数を基に復元し、API レスポンスではこちらに差し替えられる
   * （＝通常運用では非 null。null は取得・復元に失敗した場合の安全側フォールバック、
   * および単体テスト用）。詳細は README を参照。
   */
  remainingHeadToHead: RemainingHeadToHead | null
  sourceUrl: string
}

export type StandingsPayload = {
  /** 取得（サーバ側 fetch）日時 ISO8601 */
  fetchedAt: string
  leagues: LeagueStandings[]
}
