import { describe, expect, it } from 'vitest'
import {
  compareForRank,
  formatWinningPercentage,
  gamesBehind,
  winningPercentage,
} from '../lib/record'

describe('winningPercentage', () => {
  it('引き分けを分母に含めない (60勝63敗3分)', () => {
    expect(winningPercentage(60, 63)).toBeCloseTo(0.487804878, 9)
  })

  it('70勝70敗3分はちょうど .500', () => {
    expect(winningPercentage(70, 70)).toBe(0.5)
  })

  it('未消化 (0勝0敗) でも NaN にならない', () => {
    expect(winningPercentage(0, 0)).toBe(0)
    expect(Number.isNaN(winningPercentage(0, 0))).toBe(false)
  })
})

describe('formatWinningPercentage', () => {
  it('小数第3位まで、先頭の0を省く', () => {
    expect(formatWinningPercentage(0.487804878)).toBe('.488')
    expect(formatWinningPercentage(0.5)).toBe('.500')
    expect(formatWinningPercentage(0.56097561)).toBe('.561')
  })

  it('1.000 は先頭の1を残す', () => {
    expect(formatWinningPercentage(1)).toBe('1.000')
  })
})

describe('compareForRank', () => {
  it('勝率が高い方が上位', () => {
    const a = { wins: 70, losses: 56, ties: 2 }
    const b = { wins: 69, losses: 54, ties: 1 }
    // .5555 vs .5609 → b が上位
    expect(compareForRank(a, b)).toBeGreaterThan(0)
  })

  it('表示上は同じ勝率でも、丸め前の値で順位を判定する', () => {
    const a = { wins: 70, losses: 69, ties: 4 } // .503597...
    const b = { wins: 71, losses: 70, ties: 2 } // .503546...
    // 表示はどちらも .504 だが、実際の勝率は a の方が上
    expect(formatWinningPercentage(winningPercentage(70, 69))).toBe('.504')
    expect(formatWinningPercentage(winningPercentage(71, 70))).toBe('.504')
    expect(winningPercentage(70, 69)).toBeGreaterThan(winningPercentage(71, 70))
    expect(compareForRank(a, b)).toBeLessThan(0)
  })

  it('勝率が完全に同じなら勝利数で比較する', () => {
    const a = { wins: 70, losses: 70, ties: 3 }
    const b = { wins: 60, losses: 60, ties: 3 }
    expect(compareForRank(a, b)).toBeLessThan(0)
  })

  it('勝率も勝利数も同じなら 0（順位決定規定に委ねる）', () => {
    expect(compareForRank({ wins: 70, losses: 70, ties: 3 }, { wins: 70, losses: 70, ties: 1 })).toBe(0)
  })
})

describe('gamesBehind', () => {
  it('ゲーム差は (勝差 + 敗差) / 2', () => {
    expect(gamesBehind({ wins: 70, losses: 56, ties: 2 }, { wins: 61, losses: 63, ties: 3 })).toBe(8)
  })
})
