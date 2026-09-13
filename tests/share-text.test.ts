import { describe, expect, it } from 'vitest'
import { buildShareText, buildShareUrl, buildTwitterIntentUrl, REQUIRED_HASHTAG } from '../lib/share-text'
import { TEAM_HASHTAGS, teamHashtag } from '../lib/team-hashtags'
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

describe('buildShareText', () => {
  it('例のような3行構成のテキストを組み立てる', () => {
    const baystars = TEAMS.find((t) => t.id === 'baystars')!
    const text = buildShareText({
      team: baystars,
      remaining: 16,
      champion: makeRankLine({ possibleWins: 9, clinchWins: null }),
      climaxSeries: makeRankLine({ targetRank: 3, possibleWins: 0, clinchWins: 11 }),
      fiveHundred: makeFiveHundred({ requiredWins: 9 }),
    })
    expect(text).toContain('横浜DeNA、残り16試合。')
    expect(text).toContain('🏆 優勝可能ライン あと9勝')
    expect(text).toContain('🎫 CS確定ライン あと11勝')
    expect(text).toContain('⚖️ 5割 あと9勝')
    expect(text).toContain('#Vまであとどのくらい #baystars')
  })

  it('12球団すべてで #Vまであとどのくらい が1個だけ、球団別タグが1個付き、壊れた文字列を含まない', () => {
    for (const team of TEAMS) {
      const text = buildShareText({
        team,
        remaining: 16,
        champion: makeRankLine(),
        climaxSeries: makeRankLine({ targetRank: 3 }),
        fiveHundred: makeFiveHundred(),
      })

      const hashtagCount = text.split(REQUIRED_HASHTAG).length - 1
      expect(hashtagCount).toBe(1)

      const teamTag = teamHashtag(team)
      expect(TEAM_HASHTAGS[team.id]).toBeDefined()
      expect(teamTag.startsWith('#')).toBe(true)
      expect(teamTag).not.toBe(REQUIRED_HASHTAG)
      expect(text).toContain(teamTag)

      expect(text).not.toContain('undefined')
      expect(text).not.toContain('NaN')
      expect(text).not.toContain('##')
      expect(text).not.toMatch(/#\s*#/)
    }
  })

  it('優勝消滅・CS確定ラインなし・5割達成済みでも壊れない文言になる', () => {
    const team = TEAMS.find((t) => t.id === 'dragons')!
    const text = buildShareText({
      team,
      remaining: 13,
      champion: makeRankLine({ status: 'eliminated', possibleWins: null, clinchWins: null }),
      climaxSeries: makeRankLine({ targetRank: 3, status: 'possible', possibleWins: 8, clinchWins: null }),
      fiveHundred: makeFiveHundred({ status: 'clinched', requiredWins: 0 }),
    })
    expect(text).toContain('🏆 優勝 可能性なし')
    expect(text).toContain('🎫 CS可能ライン あと8勝')
    expect(text).toContain('⚖️ 5割 達成済み')
    expect(text).not.toContain('undefined')
    expect(text).not.toContain('NaN')
    expect(text).not.toContain('null')
  })
})

describe('buildShareUrl', () => {
  it('/?team=<id> の形式になり、二重スラッシュを作らない', () => {
    expect(buildShareUrl('https://example.com', 'baystars')).toBe('https://example.com/?team=baystars')
    expect(buildShareUrl('https://example.com/', 'baystars')).toBe('https://example.com/?team=baystars')
  })
})

describe('buildTwitterIntentUrl', () => {
  it('text と url を別パラメータとしてエンコードする', () => {
    const url = buildTwitterIntentUrl('あと何勝？ #Vまであとどのくらい', 'https://example.com/?team=baystars')
    expect(url.startsWith('https://twitter.com/intent/tweet?')).toBe(true)
    const parsed = new URL(url)
    expect(parsed.searchParams.get('text')).toBe('あと何勝？ #Vまであとどのくらい')
    expect(parsed.searchParams.get('url')).toBe('https://example.com/?team=baystars')
  })
})
