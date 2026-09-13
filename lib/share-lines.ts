/**
 * シェア用テキスト／シェア用画像の両方から使う、状態→文言の変換ロジック。
 * UI カード本体（pages/index.vue）とは独立した純粋関数にして、
 * 「優勝可能ライン」「CS確定ライン」等の文言をここ一箇所に集約する。
 */
import type { FiveHundredResult, RankLineResult } from './scenario'

export type RankShareLine = {
  /** 表示ラベル（例: "優勝可能ライン"） */
  label: string
  /** 値の文言（例: "あと9勝" / "確定" / "可能性なし" / "確定ラインなし"） */
  value: string
}

/**
 * 優勝・CS の「最短ライン」「確定ライン」を、状態に応じて 1〜2 行の文言に変換する。
 * - 消滅: 1行「{category}: 可能性なし」
 * - 現在の成績で既に確定（clinchWins === 0）: 1行「{category}: 確定」
 * - それ以外: 「{category}可能ライン」+「{category}確定ライン」の2行
 *   （確定ラインが存在しない場合は "確定ラインなし" と明記する）
 */
export function buildRankShareLines(result: RankLineResult, category: string): RankShareLine[] {
  if (result.status === 'eliminated') {
    return [{ label: category, value: '可能性なし' }]
  }
  if (result.clinchWins === 0) {
    return [{ label: category, value: '確定' }]
  }
  const lines: RankShareLine[] = [
    {
      label: `${category}可能ライン`,
      value: result.possibleWins !== null ? `あと${result.possibleWins}勝` : '不明',
    },
    {
      label: `${category}確定ライン`,
      value: result.clinchWins !== null ? `あと${result.clinchWins}勝` : '確定ラインなし',
    },
  ]
  return lines
}

/** 勝率5割ラインを 1 行の文言に変換する */
export function buildFiveHundredShareLine(result: FiveHundredResult): RankShareLine {
  if (result.status === 'eliminated') return { label: '5割', value: '可能性なし' }
  if (result.requiredWins === 0) return { label: '5割', value: '達成済み' }
  return { label: '5割', value: `あと${result.requiredWins}勝` }
}

/**
 * 最も情報量の多い 1 行だけを選ぶ（X 投稿など、短くまとめたい場面向け）。
 * 確定ラインがあればそれを、無ければ最短ラインを、それも無ければ状態文言を返す。
 */
export function buildRankPrimaryLine(result: RankLineResult, category: string): RankShareLine {
  if (result.status === 'eliminated') return { label: category, value: '可能性なし' }
  if (result.clinchWins === 0) return { label: category, value: '確定' }
  if (result.clinchWins !== null) {
    return { label: `${category}確定ライン`, value: `あと${result.clinchWins}勝` }
  }
  if (result.possibleWins !== null) {
    return { label: `${category}可能ライン`, value: `あと${result.possibleWins}勝` }
  }
  return { label: category, value: '不明' }
}
