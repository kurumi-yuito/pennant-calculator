/**
 * 「Vまであとどのくらい？」の中核ロジック（UI から完全に分離した純粋関数群）。
 *
 * 前提・用語:
 * - 残り試合数 = 143 - 消化試合数。
 * - 「今後の引き分けは 0」と仮定して必要勝数を出す（最短ライン・5割ライン）。
 *   引き分けが発生した場合、その分だけ敗戦が減るので必要勝数は増えない（安全側）。
 * - 最短ライン（possibleWins）: その勝数を挙げれば、他球団の結果次第で到達しうる最小勝数。
 * - 確定ライン（clinchWins）: その勝数を挙げれば、他球団の残り試合がどうなっても到達する最小勝数。
 *   確定ラインの計算では、ライバルは残り試合の非勝利分をすべて引き分けにできる（= 敗戦が増えない）
 *   という、こちらに最も不利な仮定を置く。誤った「確定」を出さないための安全側の評価。
 * - 同率（勝率・勝利数まで完全に並ぶ）は順位決定規定に委ねられるため、
 *   確定判定では「相手が上位」、最短ライン判定では「こちらが上位」として扱い、UI に注記を出す。
 *
 * 残り直接対決（h2h）について:
 * remainingHeadToHead は、NPB 公式の月別日程・結果ページから集計した終了済みカード数を基に
 * 「年間25試合 − 終了済み対戦数」で復元したものが渡ってくる（lib/head-to-head.ts）。
 * 通常運用では常に既知（non-null）の値が渡り、直接対決の依存関係
 * （A が勝てば B が負ける）を Hall 条件 / min-cut で厳密に評価できる。
 * h2h の取得・復元に失敗した場合はサーバ側がエラーとして扱い、
 * このモジュールに null を渡して不正確な計算結果を返すことはない
 * （headToHeadKnown / h2h===null の分岐は、その失敗時の安全側フォールバック、
 * および単体テストで日程不明ケースを再現するためのものとして残している）。
 * 詳細は README の「残り直接対決について」を参照。
 */
import { TOTAL_GAMES } from './teams'
import { compareForRank, winningPercentage } from './record'
import type { TeamRecordLike } from './record'
import type { LeagueStandings, RemainingHeadToHead, TeamStanding } from './types'

export type ScenarioStatus =
  | 'clinched' // 達成済み / 確定
  | 'possible' // 可能
  | 'tough' // 厳しい（ほぼ全勝が必要）
  | 'eliminated' // 消滅

export type RivalCondition = {
  teamId: string
  /** この球団が残り何勝以下なら条件を満たすか */
  maxWins: number
  /** この球団の残り試合数 */
  remaining: number
}

export type RankLineResult = {
  /** 1 = 優勝, 3 = CS 進出 */
  targetRank: number
  remaining: number
  /** 最短ライン（他球団の結果次第で到達しうる最小勝数）。到達不能なら null */
  possibleWins: number | null
  /** 確定ライン（他球団の結果によらず到達する最小勝数）。存在しなければ null */
  clinchWins: number | null
  status: ScenarioStatus
  /** 最短ラインを満たすときに必要な他球団の条件 */
  possibleConditions: RivalCondition[]
  /** 残り直接対決（日程）を考慮できたか */
  headToHeadKnown: boolean
  /** 同率が絡み、順位決定規定で結果が動きうるか */
  tieBreakSensitive: boolean
}

export type FiveHundredResult = {
  remaining: number
  /** 5割以上にするために必要な最小勝数（引き分け 0 前提） */
  requiredWins: number | null
  status: ScenarioStatus
  currentPercentage: number
  /** requiredWins 勝したときの最終成績 */
  finalWins: number
  finalLosses: number
  finalTies: number
  finalPercentage: number
  /** 現時点で勝率 5 割以上か */
  achievedNow: boolean
}

export type ProjectionRow = {
  wins: number
  losses: number
  finalWins: number
  finalLosses: number
  finalTies: number
  percentage: number
}

type Rival = {
  teamId: string
  wins: number
  losses: number
  ties: number
  remaining: number
}

type Context = {
  target: TeamStanding
  targetRemaining: number
  rivals: Rival[]
  /** 残り直接対決数（不明なら null） */
  h2h: RemainingHeadToHead | null
}

export function remainingGames(team: Pick<TeamStanding, 'games'>): number {
  return Math.max(0, TOTAL_GAMES - team.games)
}

function buildContext(standings: LeagueStandings, teamId: string): Context | null {
  const target = standings.teams.find((t) => t.teamId === teamId)
  if (!target) return null
  const rivals = standings.teams
    .filter((t) => t.teamId !== teamId)
    .map((t) => ({
      teamId: t.teamId,
      wins: t.wins,
      losses: t.losses,
      ties: t.ties,
      remaining: remainingGames(t),
    }))
  return {
    target,
    targetRemaining: remainingGames(target),
    rivals,
    h2h: standings.remainingHeadToHead,
  }
}

/** 選択球団が残り wins 勝した場合の最終成績（今後の引き分けは 0 と仮定） */
function targetFinal(ctx: Context, wins: number): TeamRecordLike {
  return {
    wins: ctx.target.wins + wins,
    losses: ctx.target.losses + (ctx.targetRemaining - wins),
    ties: ctx.target.ties,
  }
}

/** ライバルが残り a 勝、残りをすべて引き分けた場合（＝ライバルに最も有利） */
function rivalFinalTiePermissive(rival: Rival, a: number): TeamRecordLike {
  return { wins: rival.wins + a, losses: rival.losses, ties: rival.ties + (rival.remaining - a) }
}

/** ライバルが残り a 勝、残りをすべて落とした場合（＝ライバルに最も不利） */
function rivalFinalNoTies(rival: Rival, a: number): TeamRecordLike {
  return { wins: rival.wins + a, losses: rival.losses + (rival.remaining - a), ties: rival.ties }
}

/**
 * ライバルが「選択球団を下回らない」ために最低限必要な勝数。
 * 同率（勝率・勝利数が並ぶ）は相手有利として扱う。到達不能なら null。
 */
function minWinsNotBelow(rival: Rival, target: TeamRecordLike): number | null {
  for (let a = 0; a <= rival.remaining; a += 1) {
    if (compareForRank(rivalFinalTiePermissive(rival, a), target) <= 0) return a
  }
  return null
}

/**
 * ライバルが「選択球団を確実に上回る」ために最低限必要な勝数。
 * 同率はこちら有利として扱う。どれだけ勝っても上回れないなら null。
 */
function minWinsStrictlyAbove(rival: Rival, target: TeamRecordLike): number | null {
  for (let a = 0; a <= rival.remaining; a += 1) {
    if (compareForRank(rivalFinalNoTies(rival, a), target) < 0) return a
  }
  return null
}

function pairRemaining(ctx: Context, a: string, b: string): number {
  if (!ctx.h2h) return 0
  return ctx.h2h[a]?.[b] ?? 0
}

/**
 * 集合 A の球団が合計で獲得しうる最大勝数（min-cut による上界）。
 * 直接対決が不明な場合は「全員が残り全勝できる」という最も強い仮定に倒す（確定判定の安全側）。
 */
function maxWinsForSet(ctx: Context, set: Rival[], targetWins: number): number {
  if (!ctx.h2h) return set.reduce((sum, r) => sum + r.remaining, 0)
  const ids = new Set(set.map((r) => r.teamId))
  let supply = 0
  for (let i = 0; i < ctx.rivals.length; i += 1) {
    for (let j = i + 1; j < ctx.rivals.length; j += 1) {
      const a = ctx.rivals[i]
      const b = ctx.rivals[j]
      if (ids.has(a.teamId) || ids.has(b.teamId)) supply += pairRemaining(ctx, a.teamId, b.teamId)
    }
  }
  // 選択球団の負け数（= 残り試合 - 勝数）のうち、集合 A に配れる分
  const targetLosses = ctx.targetRemaining - targetWins
  const vsTarget = set.reduce((sum, r) => sum + pairRemaining(ctx, ctx.target.teamId, r.teamId), 0)
  return supply + Math.min(targetLosses, vsTarget)
}

/**
 * 集合 A の球団が必ず獲得してしまう合計勝数（下界）。
 * A 同士の直接対決と、選択球団が A に配らざるを得ない負け数から決まる。
 * 直接対決が不明な場合は 0（＝最短ラインの計算では楽観側。UI で注記する）。
 */
function forcedWinsForSet(ctx: Context, set: Rival[], targetWins: number): number {
  if (!ctx.h2h) return 0
  let forced = 0
  for (let i = 0; i < set.length; i += 1) {
    for (let j = i + 1; j < set.length; j += 1) {
      forced += pairRemaining(ctx, set[i].teamId, set[j].teamId)
    }
  }
  const vsTarget = set.reduce((sum, r) => sum + pairRemaining(ctx, ctx.target.teamId, r.teamId), 0)
  return forced + Math.max(0, vsTarget - targetWins)
}

function subsets<T>(items: T[]): T[][] {
  const result: T[][] = []
  for (let mask = 1; mask < 1 << items.length; mask += 1) {
    const subset: T[] = []
    for (let i = 0; i < items.length; i += 1) {
      if (mask & (1 << i)) subset.push(items[i])
    }
    result.push(subset)
  }
  return result
}

function combinations<T>(items: T[], size: number): T[][] {
  if (size === 0) return [[]]
  if (items.length < size) return []
  const [head, ...rest] = items
  return [...combinations(rest, size - 1).map((c) => [head, ...c]), ...combinations(rest, size)]
}

/** set の全球団が demands 以上の勝数を同時に獲得できるか（Hall 条件） */
function canAllReach(ctx: Context, set: Rival[], demands: Map<string, number>, targetWins: number): boolean {
  for (const subset of subsets(set)) {
    const need = subset.reduce((sum, r) => sum + (demands.get(r.teamId) ?? 0), 0)
    if (need > maxWinsForSet(ctx, subset, targetWins)) return false
  }
  return true
}

/** set の全球団を caps 以下の勝数に同時に抑えられるか（Hall 条件） */
function canAllBeHeld(ctx: Context, set: Rival[], caps: Map<string, number>, targetWins: number): boolean {
  for (const subset of subsets(set)) {
    const allowed = subset.reduce((sum, r) => sum + (caps.get(r.teamId) ?? 0), 0)
    if (allowed < forcedWinsForSet(ctx, subset, targetWins)) return false
  }
  return true
}

/**
 * 選択球団が残り targetWins 勝したとき、他球団の結果によらず targetRank 位以内が確定するか。
 */
function isClinched(ctx: Context, targetWins: number, targetRank: number): boolean {
  const final = targetFinal(ctx, targetWins)
  const demands = new Map<string, number>()
  const contenders: Rival[] = []
  for (const rival of ctx.rivals) {
    const need = minWinsNotBelow(rival, final)
    if (need === null) continue
    demands.set(rival.teamId, need)
    contenders.push(rival)
  }
  // targetRank 位以内を外すには、targetRank 球団が選択球団を下回らない必要がある
  if (contenders.length < targetRank) return true
  for (const set of combinations(contenders, targetRank)) {
    if (canAllReach(ctx, set, demands, targetWins)) return false
  }
  return true
}

type PossibleResult = {
  ok: boolean
  conditions: RivalCondition[]
  tieBreakSensitive: boolean
}

/**
 * 選択球団が残り targetWins 勝したとき、他球団の結果次第で targetRank 位以内になりうるか。
 * 「上回られてよい球団」は targetRank - 1 チームまで。
 */
function isPossible(ctx: Context, targetWins: number, targetRank: number): PossibleResult {
  const final = targetFinal(ctx, targetWins)
  const caps = new Map<string, number>()
  const holdable: Rival[] = []
  let tieBreakSensitive = false
  for (const rival of ctx.rivals) {
    const above = minWinsStrictlyAbove(rival, final)
    const cap = above === null ? rival.remaining : above - 1
    if (cap < 0) continue // 残り全敗でも選択球団を上回る＝抑え込めない
    caps.set(rival.teamId, Math.min(cap, rival.remaining))
    holdable.push(rival)
    // cap 勝ちょうどだと勝率・勝利数が完全に並ぶ場合は順位決定規定次第
    if (compareForRank(rivalFinalNoTies(rival, Math.min(cap, rival.remaining)), final) === 0) {
      tieBreakSensitive = true
    }
  }
  const holdCount = ctx.rivals.length - (targetRank - 1)
  if (holdable.length < holdCount) return { ok: false, conditions: [], tieBreakSensitive }

  let best: { set: Rival[]; slack: number } | null = null
  for (const set of combinations(holdable, holdCount)) {
    if (!canAllBeHeld(ctx, set, caps, targetWins)) continue
    const slack = set.reduce((sum, r) => sum + (caps.get(r.teamId) ?? 0), 0)
    if (!best || slack > best.slack) best = { set, slack }
  }
  if (!best) return { ok: false, conditions: [], tieBreakSensitive }
  const conditions = best.set
    .map((r) => ({ teamId: r.teamId, maxWins: caps.get(r.teamId) ?? 0, remaining: r.remaining }))
    .sort((a, b) => a.maxWins - b.maxWins)
  return { ok: true, conditions, tieBreakSensitive }
}

/** 優勝（targetRank=1）／CS（targetRank=3）の最短ライン・確定ラインを求める */
export function calcRankLines(
  standings: LeagueStandings,
  teamId: string,
  targetRank: number,
): RankLineResult | null {
  const ctx = buildContext(standings, teamId)
  if (!ctx) return null
  const remaining = ctx.targetRemaining

  let possibleWins: number | null = null
  let conditions: RivalCondition[] = []
  let tieBreakSensitive = false
  for (let n = 0; n <= remaining; n += 1) {
    const result = isPossible(ctx, n, targetRank)
    if (result.ok) {
      possibleWins = n
      conditions = result.conditions
      tieBreakSensitive = result.tieBreakSensitive
      break
    }
  }

  let clinchWins: number | null = null
  for (let n = possibleWins ?? 0; n <= remaining; n += 1) {
    if (isClinched(ctx, n, targetRank)) {
      clinchWins = n
      break
    }
  }

  let status: ScenarioStatus
  if (possibleWins === null) status = 'eliminated'
  else if (clinchWins === 0) status = 'clinched'
  else if (remaining > 0 && possibleWins >= Math.ceil(remaining * 0.8)) status = 'tough'
  else status = 'possible'

  return {
    targetRank,
    remaining,
    possibleWins,
    clinchWins,
    status,
    possibleConditions: conditions,
    headToHeadKnown: ctx.h2h !== null,
    tieBreakSensitive,
  }
}

/**
 * 勝率 5 割ライン。
 * 今後の引き分けを 0 と仮定し、(勝 + N) / (勝 + 敗 + 残り) >= 0.5 となる最小の N を求める。
 * 実際に引き分けが出た場合は敗戦が減るだけなので、この N は常に十分（安全側）。
 */
export function calcFiveHundredLine(team: TeamStanding): FiveHundredResult {
  const remaining = remainingGames(team)
  const decided = team.wins + team.losses + remaining
  const currentPercentage = winningPercentage(team.wins, team.losses)
  const achievedNow = currentPercentage >= 0.5
  const rawRequired = Math.ceil(decided / 2 - team.wins)
  const requiredWins = Math.max(0, rawRequired)

  let status: ScenarioStatus
  if (requiredWins > remaining) status = 'eliminated'
  else if (requiredWins === 0) status = 'clinched'
  else if (remaining > 0 && requiredWins >= Math.ceil(remaining * 0.8)) status = 'tough'
  else status = 'possible'

  const reachable = requiredWins <= remaining
  const finalWins = team.wins + (reachable ? requiredWins : remaining)
  const finalLosses = team.losses + remaining - (reachable ? requiredWins : remaining)
  return {
    remaining,
    requiredWins: reachable ? requiredWins : null,
    status,
    currentPercentage,
    finalWins,
    finalLosses,
    finalTies: team.ties,
    finalPercentage: winningPercentage(finalWins, finalLosses),
    achievedNow,
  }
}

/** 現在順位（勝率 → 勝利数）。同率で並んだ場合は tied = true */
export function currentRank(standings: LeagueStandings, teamId: string): { rank: number; tied: boolean } | null {
  const target = standings.teams.find((t) => t.teamId === teamId)
  if (!target) return null
  let above = 0
  let tied = false
  for (const other of standings.teams) {
    if (other.teamId === teamId) continue
    const cmp = compareForRank(other, target)
    if (cmp < 0) above += 1
    else if (cmp === 0) tied = true
  }
  return { rank: above + 1, tied }
}

/**
 * 残り勝数 → 最終成績の一覧。
 * 重要なライン（5割・CS・優勝）の前後だけを連続した範囲で切り出す。
 */
export function buildProjection(
  team: TeamStanding,
  highlights: (number | null)[],
  maxRows = 7,
): ProjectionRow[] {
  const remaining = remainingGames(team)
  const toRow = (wins: number): ProjectionRow => {
    const finalWins = team.wins + wins
    const finalLosses = team.losses + (remaining - wins)
    return {
      wins,
      losses: remaining - wins,
      finalWins,
      finalLosses,
      finalTies: team.ties,
      percentage: winningPercentage(finalWins, finalLosses),
    }
  }
  if (remaining === 0) return [toRow(0)]

  const valid = highlights.filter(
    (h): h is number => h !== null && Number.isFinite(h) && h >= 0 && h <= remaining,
  )
  const anchor = valid.length > 0 ? valid[0] : Math.ceil(remaining / 2)
  let low = valid.length > 0 ? Math.min(...valid) : anchor
  let high = valid.length > 0 ? Math.max(...valid) : anchor
  if (high - low + 1 > maxRows) {
    low = anchor - Math.floor((maxRows - 1) / 2)
    high = low + maxRows - 1
  }
  low = Math.max(0, low)
  high = Math.min(remaining, high)
  // maxRows に届かない分は前後に広げる
  while (high - low + 1 < maxRows && !(low === 0 && high === remaining)) {
    if (low > 0) low -= 1
    if (high - low + 1 < maxRows && high < remaining) high += 1
  }

  const rows: ProjectionRow[] = []
  for (let wins = low; wins <= high; wins += 1) rows.push(toRow(wins))
  return rows
}

/** 表示する意味のある条件（残り全勝が許されるなら実質無条件なので除く）だけに絞る */
export function bindingConditions(conditions: RivalCondition[]): RivalCondition[] {
  return conditions.filter((condition) => condition.maxWins < condition.remaining)
}
