/**
 * 勝敗レコードと勝率まわりの純粋関数。
 * NPB 方式に合わせ、勝率 = 勝 / (勝 + 敗)。引き分けは分母に含めない。
 */

export type TeamRecordLike = {
  wins: number
  losses: number
  ties: number
}

/**
 * 勝率（丸めなしの生値）。
 * 勝敗が 0 の場合（= 分母 0）は NaN を返さず 0 とする。
 */
export function winningPercentage(wins: number, losses: number): number {
  const decided = wins + losses
  if (decided <= 0) return 0
  return wins / decided
}

/** NPB 順位表と同じく小数第 3 位まで（先頭の 0 を省く）。例: 0.487804 -> ".488" */
export function formatWinningPercentage(pct: number): string {
  if (!Number.isFinite(pct)) return '----'
  const fixed = pct.toFixed(3)
  return fixed.startsWith('0.') ? fixed.slice(1) : fixed
}

/** ゲーム差（表示用）。first を基準にした relative のゲーム差 */
export function gamesBehind(first: TeamRecordLike, other: TeamRecordLike): number {
  return ((first.wins - other.wins) + (other.losses - first.losses)) / 2
}

/**
 * 順位比較。戻り値が負なら a が上位。
 * 1. 勝率（丸め前の値。整数の交差積で厳密比較する）
 * 2. 勝利数
 * それでも並んだ場合は 0（= 順位決定規定に委ねられる領域）を返す。
 * 表示用に丸めた勝率は絶対に使わない。
 */
export function compareForRank(a: TeamRecordLike, b: TeamRecordLike): number {
  const aDecided = a.wins + a.losses
  const bDecided = b.wins + b.losses
  // a.wins / aDecided <=> b.wins / bDecided を整数演算で厳密に比較する
  const left = a.wins * (bDecided === 0 ? 1 : bDecided)
  const right = b.wins * (aDecided === 0 ? 1 : aDecided)
  if (aDecided === 0 || bDecided === 0) {
    const aPct = winningPercentage(a.wins, a.losses)
    const bPct = winningPercentage(b.wins, b.losses)
    if (aPct !== bPct) return bPct - aPct
  } else if (left !== right) {
    return right - left
  }
  if (a.wins !== b.wins) return b.wins - a.wins
  return 0
}

/** compareForRank で a が b より確実に上位か */
export function isStrictlyAbove(a: TeamRecordLike, b: TeamRecordLike): boolean {
  return compareForRank(a, b) < 0
}

/** a が b より下位だと確実に言えるか（同率は「言えない」＝ false） */
export function isStrictlyBelow(a: TeamRecordLike, b: TeamRecordLike): boolean {
  return compareForRank(a, b) > 0
}
