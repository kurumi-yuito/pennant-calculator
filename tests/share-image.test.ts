import { describe, expect, it } from 'vitest'
import { buildShareImageData, computeTeamNameLayout } from '../lib/share-image'
import { TEAMS } from '../lib/teams'
import type { FiveHundredResult, RankLineResult } from '../lib/scenario'

function makeRankLine(overrides: Partial<RankLineResult> = {}): RankLineResult {
  return {
    targetRank: 1,
    remaining: 16,
    possibleWins: 9,
    clinchWins: null,
    status: 'possible',
    possibleConditions: [],
    headToHeadKnown: false,
    tieBreakSensitive: false,
    ...overrides,
  }
}

function makeFiveHundred(overrides: Partial<FiveHundredResult> = {}): FiveHundredResult {
  return {
    remaining: 16,
    requiredWins: 9,
    status: 'possible',
    currentPercentage: 0.492,
    finalWins: 70,
    finalLosses: 70,
    finalTies: 3,
    finalPercentage: 0.5,
    achievedNow: false,
    ...overrides,
  }
}

const baystars = TEAMS.find((t) => t.id === 'baystars')!

describe('buildShareImageData（通常ケース）', () => {
  const data = buildShareImageData({
    team: baystars,
    rank: 3,
    tied: false,
    wins: 61,
    losses: 63,
    ties: 3,
    remaining: 16,
    champion: makeRankLine({ possibleWins: 9, clinchWins: null }),
    climaxSeries: makeRankLine({ targetRank: 3, possibleWins: 0, clinchWins: 11 }),
    fiveHundred: makeFiveHundred({ requiredWins: 9 }),
    asOfLabel: '2026年9月12日',
  })

  it('現在地の行を正しく組み立てる', () => {
    expect(data.rankLine).toBe('現在3位')
    expect(data.recordLine).toBe('61勝63敗3分')
    expect(data.remainingLine).toBe('残り16試合')
    expect(data.asOfLine).toBe('9月12日終了時点')
    expect(data.hashtag).toBe('#Vまであとどのくらい')
  })

  it('優勝可能ライン・CS可能/確定ライン・5割の行を含む', () => {
    const texts = data.lines.map((l) => `${l.label} ${l.value}`)
    expect(texts).toContain('優勝可能ライン あと9勝')
    expect(texts).toContain('優勝確定ライン 確定ラインなし')
    expect(texts).toContain('CS可能ライン あと0勝')
    expect(texts).toContain('CS確定ライン あと11勝')
    expect(texts).toContain('5割 あと9勝')
  })

  it('同率のときは「タイ」を付ける', () => {
    const tied = buildShareImageData({
      team: baystars,
      rank: 3,
      tied: true,
      wins: 61,
      losses: 63,
      ties: 3,
      remaining: 16,
      champion: makeRankLine(),
      climaxSeries: makeRankLine({ targetRank: 3 }),
      fiveHundred: makeFiveHundred(),
      asOfLabel: '2026年9月12日',
    })
    expect(tied.rankLine).toBe('現在3位タイ')
  })
})

describe('buildShareImageData（優勝消滅）', () => {
  it('優勝は「可能性なし」の1行になる', () => {
    const data = buildShareImageData({
      team: TEAMS.find((t) => t.id === 'dragons')!,
      rank: 5,
      tied: false,
      wins: 54,
      losses: 74,
      ties: 2,
      remaining: 13,
      champion: makeRankLine({ status: 'eliminated', possibleWins: null, clinchWins: null }),
      climaxSeries: makeRankLine({ targetRank: 3, status: 'possible', possibleWins: 8, clinchWins: null }),
      fiveHundred: makeFiveHundred({ status: 'eliminated', requiredWins: null }),
      asOfLabel: '2026年9月12日',
    })
    const pennant = data.lines.filter((l) => l.icon === '🏆')
    expect(pennant).toEqual([{ icon: '🏆', label: '優勝', value: '可能性なし' }])
    const five = data.lines.find((l) => l.icon === '⚖️')
    expect(five?.value).toBe('可能性なし')
  })
})

describe('buildShareImageData（CS確定ラインなし）', () => {
  it('CS確定ラインが存在しない場合は「確定ラインなし」と明記する', () => {
    const data = buildShareImageData({
      team: baystars,
      rank: 3,
      tied: false,
      wins: 61,
      losses: 63,
      ties: 3,
      remaining: 16,
      champion: makeRankLine(),
      climaxSeries: makeRankLine({ targetRank: 3, status: 'possible', possibleWins: 7, clinchWins: null }),
      fiveHundred: makeFiveHundred(),
      asOfLabel: '2026年9月12日',
    })
    const csClinch = data.lines.find((l) => l.label === 'CS確定ライン')
    expect(csClinch?.value).toBe('確定ラインなし')
  })
})

describe('buildShareImageData（5割達成済み）', () => {
  it('5割は「達成済み」の1行になる', () => {
    const data = buildShareImageData({
      team: baystars,
      rank: 1,
      tied: false,
      wins: 80,
      losses: 45,
      ties: 3,
      remaining: 15,
      champion: makeRankLine({ status: 'possible', possibleWins: 0, clinchWins: 7 }),
      climaxSeries: makeRankLine({ targetRank: 3, status: 'clinched', possibleWins: 0, clinchWins: 0 }),
      fiveHundred: makeFiveHundred({ status: 'clinched', requiredWins: 0 }),
      asOfLabel: '2026年9月12日',
    })
    const five = data.lines.find((l) => l.icon === '⚖️')
    expect(five?.value).toBe('達成済み')
    const cs = data.lines.filter((l) => l.icon === '🎫')
    expect(cs).toEqual([{ icon: '🎫', label: 'CS', value: '確定' }])
  })
})

describe('computeTeamNameLayout（長い球団名でも文字切れしない）', () => {
  it('実在する12球団すべてで1行に収まるフォントサイズが決まる', () => {
    for (const team of TEAMS) {
      const layout = computeTeamNameLayout(team.name)
      expect(layout.lines.join('')).toBe(team.name)
      expect(layout.fontSize).toBeGreaterThan(0)
      // 現行12球団は最長でも1行に収まる設計になっている
      expect(layout.lines).toHaveLength(1)
    }
  })

  it('想定を超える長さの名前は2行に折り返し、文字を失わない', () => {
    const veryLongName = 'あいうえおかきくけこさしすせそたちつてと'
    const layout = computeTeamNameLayout(veryLongName)
    expect(layout.lines.length).toBeGreaterThanOrEqual(2)
    expect(layout.lines.join('')).toBe(veryLongName)
    expect(layout.fontSize).toBeGreaterThan(0)
  })

  it('最長球団名（東北楽天ゴールデンイーグルス）でも欠落なく保持する', () => {
    const eagles = TEAMS.find((t) => t.id === 'eagles')!
    const layout = computeTeamNameLayout(eagles.name)
    expect(layout.lines.join('')).toBe(eagles.name)
  })
})
