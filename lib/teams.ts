import type { LeagueId } from './types'

/** 2026 年度 NPB 一軍公式戦は 1 球団 143 試合制 */
export const TOTAL_GAMES = 143

export type TeamInfo = {
  /** URL クエリにも使う slug */
  id: string
  /** 正式名称 */
  name: string
  /** 画面表示用の短縮名 */
  shortName: string
  league: LeagueId
  /** 正式名称の表記ゆれを吸収するためのキーワード */
  nameKeys: string[]
}

export const TEAMS: readonly TeamInfo[] = [
  { id: 'tigers', name: '阪神タイガース', shortName: '阪神', league: 'central', nameKeys: ['阪神'] },
  { id: 'giants', name: '読売ジャイアンツ', shortName: '巨人', league: 'central', nameKeys: ['読売', '巨人'] },
  { id: 'baystars', name: '横浜DeNAベイスターズ', shortName: '横浜DeNA', league: 'central', nameKeys: ['DeNA', 'ＤｅＮＡ'] },
  { id: 'swallows', name: '東京ヤクルトスワローズ', shortName: 'ヤクルト', league: 'central', nameKeys: ['ヤクルト'] },
  { id: 'dragons', name: '中日ドラゴンズ', shortName: '中日', league: 'central', nameKeys: ['中日'] },
  { id: 'carp', name: '広島東洋カープ', shortName: '広島', league: 'central', nameKeys: ['広島'] },
  { id: 'hawks', name: '福岡ソフトバンクホークス', shortName: 'ソフトバンク', league: 'pacific', nameKeys: ['ソフトバンク'] },
  { id: 'lions', name: '埼玉西武ライオンズ', shortName: '西武', league: 'pacific', nameKeys: ['西武'] },
  { id: 'fighters', name: '北海道日本ハムファイターズ', shortName: '日本ハム', league: 'pacific', nameKeys: ['日本ハム'] },
  { id: 'buffaloes', name: 'オリックス・バファローズ', shortName: 'オリックス', league: 'pacific', nameKeys: ['オリックス'] },
  { id: 'marines', name: '千葉ロッテマリーンズ', shortName: 'ロッテ', league: 'pacific', nameKeys: ['ロッテ'] },
  { id: 'eagles', name: '東北楽天ゴールデンイーグルス', shortName: '楽天', league: 'pacific', nameKeys: ['楽天'] },
] as const

export const LEAGUE_LABEL: Record<LeagueId, string> = {
  central: 'セントラル・リーグ',
  pacific: 'パシフィック・リーグ',
}

export function getTeam(teamId: string): TeamInfo | undefined {
  return TEAMS.find((t) => t.id === teamId)
}

export function teamsOfLeague(league: LeagueId): TeamInfo[] {
  return TEAMS.filter((t) => t.league === league)
}

/** NPB 順位表の球団名から球団を特定する */
export function findTeamByOfficialName(name: string, league?: LeagueId): TeamInfo | undefined {
  const normalized = name.replace(/\s/g, '')
  return TEAMS.find(
    (t) =>
      (league === undefined || t.league === league) &&
      (t.name === normalized || t.nameKeys.some((key) => normalized.includes(key))),
  )
}
