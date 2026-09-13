/**
 * 球団別ハッシュタグの唯一の管理場所。
 *
 * X（旧Twitter）のハッシュタグとして安全に使える文字列にする必要があるため、
 * 「・」や空白などハッシュタグを分断する文字は含めない。
 * 12 球団すべてに必ず 1 つずつ割り当てる（欠けている・undefined になることは許容しない）。
 */
import type { TeamInfo } from './teams'

export const TEAM_HASHTAGS: Record<string, string> = {
  tigers: '#阪神タイガース',
  giants: '#読売ジャイアンツ',
  baystars: '#baystars',
  swallows: '#ヤクルトスワローズ',
  dragons: '#中日ドラゴンズ',
  carp: '#広島東洋カープ',
  hawks: '#ソフトバンクホークス',
  lions: '#埼玉西武ライオンズ',
  fighters: '#日本ハムファイターズ',
  buffaloes: '#オリックスバファローズ',
  marines: '#千葉ロッテマリーンズ',
  eagles: '#東北楽天イーグルス',
}

/** 未登録の球団でも壊れないよう、フォールバックとして球団名からハッシュタグを組み立てる */
export function teamHashtag(team: Pick<TeamInfo, 'id' | 'shortName'>): string {
  const fixed = TEAM_HASHTAGS[team.id]
  if (fixed) return fixed
  const sanitized = team.shortName.replace(/[・\s#]/g, '')
  return sanitized ? `#${sanitized}` : '#NPB'
}
