/**
 * X（旧Twitter）共有用のテキスト・URL を組み立てる純粋関数。
 *
 * ここでは「テキスト＋URL＋ハッシュタグ」の組み立てのみを扱う（画像そのものは含まない）。
 * X Web Intent（URL ベース、新しいタブで開く）はそもそも画像の事前添付に対応していないため、
 * 画像を使うシェアは pages/index.vue が navigator.share（Web Share API）経由で
 * 別途対応している。詳細は README の「Xシェアと画像添付について」を参照。
 */
import type { FiveHundredResult, RankLineResult } from './scenario'
import type { TeamInfo } from './teams'
import { teamHashtag } from './team-hashtags'
import { buildFiveHundredShareLine, buildRankPrimaryLine } from './share-lines'

export const REQUIRED_HASHTAG = '#Vまであとどのくらい'

export type ShareTextInput = {
  team: Pick<TeamInfo, 'id' | 'shortName'>
  remaining: number
  champion: RankLineResult
  climaxSeries: RankLineResult
  fiveHundred: FiveHundredResult
}

function formatLine(line: { label: string; value: string }, icon: string): string {
  return `${icon} ${line.label} ${line.value}`
}

/**
 * X 投稿本文を組み立てる。
 *
 *   横浜DeNA、残り16試合。
 *
 *   🏆 優勝可能ライン あと9勝
 *   🎫 CS確定ライン あと11勝
 *   ⚖️ 5割 あと9勝
 *
 *   #Vまであとどのくらい #baystars
 *
 * 必須ハッシュタグ #Vまであとどのくらい が必ず 1 個だけ、球団別ハッシュタグが必ず 1 個付く。
 */
export function buildShareText(input: ShareTextInput): string {
  const { team, remaining, champion, climaxSeries, fiveHundred } = input
  const pennantLine = formatLine(buildRankPrimaryLine(champion, '優勝'), '🏆')
  const csLine = formatLine(buildRankPrimaryLine(climaxSeries, 'CS'), '🎫')
  const fiveHundredLine = formatLine(buildFiveHundredShareLine(fiveHundred), '⚖️')
  const hashtags = `${REQUIRED_HASHTAG} ${teamHashtag(team)}`

  return [`${team.shortName}、残り${remaining}試合。`, '', pennantLine, csLine, fiveHundredLine, '', hashtags].join(
    '\n',
  )
}

/** 選択中の球団を復元できる共有 URL（例: https://example.com/?team=baystars） */
export function buildShareUrl(origin: string, teamId: string): string {
  const base = origin.replace(/\/$/, '')
  return `${base}/?team=${encodeURIComponent(teamId)}`
}

/** X Web Intent の URL。text と url は別パラメータで渡す（Web Intent 側で自動的に連結表示される） */
export function buildTwitterIntentUrl(text: string, url: string): string {
  const params = new URLSearchParams({ text, url })
  return `https://twitter.com/intent/tweet?${params.toString()}`
}
