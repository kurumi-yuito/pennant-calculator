/**
 * シェア用 PNG 画像に描画する「データ」を組み立てる純粋関数。
 *
 * Canvas / DOM には一切依存しない（この層は Node でも単体テストできる）。
 * 実際の Canvas 描画は components 側（クライアント専用）が、
 * ここで作った ShareImageData を読んで座標に落とし込む。
 */
import type { FiveHundredResult, RankLineResult } from './scenario'
import type { TeamInfo } from './teams'
import { buildFiveHundredShareLine, buildRankShareLines } from './share-lines'
import { REQUIRED_HASHTAG } from './share-text'

export type ShareImageLine = {
  icon: string
  label: string
  value: string
}

export type TeamNameLayout = {
  /** 描画に使うフォントサイズ (px) */
  fontSize: number
  /** 1〜2 行に分割済みの球団名 */
  lines: string[]
}

export type ShareImageData = {
  teamNameLayout: TeamNameLayout
  /** 例: "現在3位" / "現在3位タイ" */
  rankLine: string
  /** 例: "61勝63敗3分" */
  recordLine: string
  /** 例: "残り16試合" */
  remainingLine: string
  /** 優勝・CS・5割の状態行（3〜6行） */
  lines: ShareImageLine[]
  /** 例: "9月12日終了時点" */
  asOfLine: string
  hashtag: string
}

export type ShareImageInput = {
  team: Pick<TeamInfo, 'name'>
  rank: number
  tied: boolean
  wins: number
  losses: number
  ties: number
  remaining: number
  champion: RankLineResult
  climaxSeries: RankLineResult
  fiveHundred: FiveHundredResult
  /** 順位表の asOfLabel（例: "2026年9月12日"）。年を落として画像用に短縮する */
  asOfLabel: string
}

/**
 * 長い球団名でも文字切れしないよう、文字数に応じてフォントサイズを下げ、
 * それでも収まらない長さなら 2 行に折り返す。
 * CJK は概ね正方形のグリフなので、コードポイント数を目安に判定する。
 */
export function computeTeamNameLayout(name: string): TeamNameLayout {
  const chars = [...name]
  const length = chars.length
  if (length <= 8) return { fontSize: 60, lines: [name] }
  if (length <= 11) return { fontSize: 52, lines: [name] }
  if (length <= 14) return { fontSize: 44, lines: [name] }

  // 想定を超える長さの場合は 2 行に折り返す（フォントサイズも一段階下げる）
  const mid = Math.ceil(length / 2)
  return {
    fontSize: 38,
    lines: [chars.slice(0, mid).join(''), chars.slice(mid).join('')],
  }
}

function formatRecordLine(wins: number, losses: number, ties: number): string {
  return ties > 0 ? `${wins}勝${losses}敗${ties}分` : `${wins}勝${losses}敗`
}

/** "2026年9月12日" → "9月12日終了時点" */
function formatAsOfLine(asOfLabel: string): string {
  const matched = asOfLabel.match(/(\d+)月(\d+)日/)
  if (!matched) return asOfLabel ? `${asOfLabel}終了時点` : ''
  return `${matched[1]}月${matched[2]}日終了時点`
}

export function buildShareImageData(input: ShareImageInput): ShareImageData {
  const pennantLines = buildRankShareLines(input.champion, '優勝').map((l) => ({ icon: '🏆', ...l }))
  const csLines = buildRankShareLines(input.climaxSeries, 'CS').map((l) => ({ icon: '🎫', ...l }))
  const fiveHundredLine = { icon: '⚖️', ...buildFiveHundredShareLine(input.fiveHundred) }

  return {
    teamNameLayout: computeTeamNameLayout(input.team.name),
    rankLine: `現在${input.rank}位${input.tied ? 'タイ' : ''}`,
    recordLine: formatRecordLine(input.wins, input.losses, input.ties),
    remainingLine: `残り${input.remaining}試合`,
    lines: [...pennantLines, ...csLines, fiveHundredLine],
    asOfLine: formatAsOfLine(input.asOfLabel),
    hashtag: REQUIRED_HASHTAG,
  }
}
