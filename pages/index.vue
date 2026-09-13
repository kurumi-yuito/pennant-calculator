<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useAnalytics } from '~/composables/useAnalytics'
import { renderShareImagePng } from '~/composables/useShareImagePng'
import { LEAGUE_LABEL, TOTAL_GAMES, getTeam, teamsOfLeague } from '~/lib/teams'
import { formatWinningPercentage } from '~/lib/record'
import {
  buildProjection,
  calcConditionsRange,
  calcFiveHundredLine,
  calcRankLines,
  currentRank,
  remainingGames,
} from '~/lib/scenario'
import { fiveHundredStatusLabel, rankStatusLabel, statusTone } from '~/lib/labels'
import { buildShareImageData } from '~/lib/share-image'
import { buildShareText, buildShareUrl, buildTwitterIntentUrl } from '~/lib/share-text'
import type { ConditionsAtWins, ProjectionRow, RankLineResult } from '~/lib/scenario'
import type { LeagueId, StandingsPayload } from '~/lib/types'

const route = useRoute()
const router = useRouter()
const { track } = useAnalytics()

const { data, error, refresh, status } = await useFetch<StandingsPayload>('/api/standings')

const selectedTeamId = computed<string>({
  get() {
    const raw = route.query.team
    const value = Array.isArray(raw) ? raw[0] : raw
    return typeof value === 'string' && getTeam(value) ? value : ''
  },
  set(value: string) {
    const team = getTeam(value)
    if (team && value !== selectedTeamId.value) {
      track('team_select', { team: team.id, league: team.league })
    }
    router.replace({ query: value ? { team: value } : {} })
  },
})

const leagues: LeagueId[] = ['central', 'pacific']

const selectedTeam = computed(() => (selectedTeamId.value ? getTeam(selectedTeamId.value) : undefined))

const standings = computed(() => {
  const team = selectedTeam.value
  if (!team || !data.value) return null
  return data.value.leagues.find((l) => l.league === team.league) ?? null
})

const standing = computed(() => {
  const league = standings.value
  if (!league) return null
  return league.teams.find((t) => t.teamId === selectedTeamId.value) ?? null
})

const rank = computed(() => {
  const league = standings.value
  if (!league) return null
  return currentRank(league, selectedTeamId.value)
})

const remaining = computed(() => (standing.value ? remainingGames(standing.value) : 0))

const champion = computed(() =>
  standings.value ? calcRankLines(standings.value, selectedTeamId.value, 1) : null,
)
const climaxSeries = computed(() =>
  standings.value ? calcRankLines(standings.value, selectedTeamId.value, 3) : null,
)
const fiveHundred = computed(() => (standing.value ? calcFiveHundredLine(standing.value) : null))

/**
 * 行数が多い場合、最初（最短ライン）と最後（条件なしで確定する勝数）を必ず含めつつ
 * 均等に間引く。「最短ラインぴったり」という1点だけでなく、勝つほど他球団への条件が
 * 緩んでいく様子をコンパクトな表で示すため。
 */
function sampleConditionRows(rows: ConditionsAtWins[], maxCount = 6): ConditionsAtWins[] {
  if (rows.length <= maxCount) return rows
  const picked: ConditionsAtWins[] = []
  for (let i = 0; i < maxCount; i += 1) {
    const idx = Math.round((i * (rows.length - 1)) / (maxCount - 1))
    picked.push(rows[idx])
  }
  return picked.filter((row, i) => i === 0 || row.wins !== picked[i - 1].wins)
}

const championConditions = computed(() =>
  standings.value ? sampleConditionRows(calcConditionsRange(standings.value, selectedTeamId.value, 1)) : [],
)
const climaxConditions = computed(() =>
  standings.value ? sampleConditionRows(calcConditionsRange(standings.value, selectedTeamId.value, 3)) : [],
)

function formatConditions(row: ConditionsAtWins): string {
  if (row.clinched) return '確定（他球団の結果によらず到達）'
  if (row.conditions.length === 0) return '条件なし（他球団がどうなっても到達可能）'
  return row.conditions
    .map((c) => `${teamName(c.teamId)}: 残り${c.remaining}試合で${c.maxWins}勝以下`)
    .join(' かつ ')
}

// SSR の初期結果も hydration 後に一度計測する。取得時刻だけの変化は重複扱い。
const resultAnalyticsKey = computed(() => {
  if (error.value || !standing.value || !champion.value || !climaxSeries.value || !fiveHundred.value) return null
  return JSON.stringify([selectedTeamId.value, standings.value])
})

onMounted(() => {
  watch(resultAnalyticsKey, (key) => {
    if (!key) return
    track('result_view', {
      team: selectedTeamId.value,
      championship_possible: champion.value?.status !== 'eliminated',
      cs_possible: climaxSeries.value?.status !== 'eliminated',
      five_hundred_possible: fiveHundred.value?.status !== 'eliminated',
    })
  }, { immediate: true, flush: 'post' })

  watch(error, (failure) => {
    if (!failure) return
    const status = Number(failure.statusCode ?? failure.status ?? 0)
    track('api_error', {
      endpoint: '/api/standings',
      status: Number.isFinite(status) ? status : 0,
    })
  }, { immediate: true, flush: 'post' })
})

const projection = computed(() => {
  if (!standing.value) return []
  return buildProjection(standing.value, [
    fiveHundred.value?.requiredWins ?? null,
    climaxSeries.value?.possibleWins ?? null,
    climaxSeries.value?.clinchWins ?? null,
    champion.value?.possibleWins ?? null,
  ])
})

function projectionMarks(row: ProjectionRow): string[] {
  const marks: string[] = []
  if (row.percentage >= 0.5) marks.push('5割')
  const cs = climaxSeries.value
  if (cs?.clinchWins !== null && cs?.clinchWins !== undefined && row.wins >= cs.clinchWins) {
    marks.push('CS確定')
  } else if (cs?.possibleWins !== null && cs?.possibleWins !== undefined && row.wins >= cs.possibleWins) {
    marks.push('CS可能')
  }
  const pennant = champion.value
  if (pennant?.clinchWins !== null && pennant?.clinchWins !== undefined && row.wins >= pennant.clinchWins) {
    marks.push('優勝確定')
  } else if (
    pennant?.possibleWins !== null &&
    pennant?.possibleWins !== undefined &&
    row.wins >= pennant.possibleWins
  ) {
    marks.push('優勝可能')
  }
  return marks
}

function teamName(teamId: string): string {
  return getTeam(teamId)?.shortName ?? teamId
}

function lossesFor(wins: number): number {
  return Math.max(0, remaining.value - wins)
}

/** 「あと0勝」という不自然な表示を避ける */
function winsPhrase(wins: number | null): string {
  if (wins === null) return '-'
  return wins === 0 ? '現在の成績のままでも可能' : `あと${wins}勝`
}

const asOfLabel = computed(() => {
  const league = standings.value ?? data.value?.leagues[0]
  return league?.asOfLabel ?? ''
})

/**
 * asOfLabel の直後に添える補足。勝敗表ページ自体の基準日（sourceAsOfDate）より後の
 * NPB公式試合結果を差分反映した場合にのみ表示し、通常時は空文字（表示なし）のまま。
 */
const asOfStatusNote = computed(() => {
  const league = standings.value ?? data.value?.leagues[0]
  if (!league) return ''
  if (league.isPartialDay) return '（終了試合のみ反映）'
  if (league.asOfDate && league.sourceAsOfDate && league.asOfDate !== league.sourceAsOfDate) {
    return '（NPB公式試合結果を反映）'
  }
  return ''
})

const fetchedAtLabel = computed(() => {
  if (!data.value?.fetchedAt) return ''
  const date = new Date(data.value.fetchedAt)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('ja-JP', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Tokyo',
  }).format(date)
})

const headToHeadKnown = computed(() => climaxSeries.value?.headToHeadKnown ?? true)
const tieBreakSensitive = computed(
  () => (champion.value?.tieBreakSensitive ?? false) || (climaxSeries.value?.tieBreakSensitive ?? false),
)

function clinchNote(result: RankLineResult): string {
  return result.targetRank === 1 ? '他球団の結果によらず優勝' : '他球団の結果によらず3位以内'
}

// --- 共有機能（画像生成 / X シェア） ---------------------------------------
// 画像・テキストいずれも lib/ 側の純粋関数で組み立てる。DOM 操作（Canvas 描画・
// window.open 等）はここ（クリック時）でのみ行い、SSR 中には実行しない。

const shareImageData = computed(() => {
  if (!selectedTeam.value || !standing.value || !champion.value || !climaxSeries.value || !fiveHundred.value) {
    return null
  }
  const r = rank.value ?? { rank: 0, tied: false }
  return buildShareImageData({
    team: selectedTeam.value,
    rank: r.rank,
    tied: r.tied,
    wins: standing.value.wins,
    losses: standing.value.losses,
    ties: standing.value.ties,
    remaining: remaining.value,
    champion: champion.value,
    climaxSeries: climaxSeries.value,
    fiveHundred: fiveHundred.value,
    asOfLabel: asOfLabel.value,
  })
})

const shareText = computed(() => {
  if (!selectedTeam.value || !champion.value || !climaxSeries.value || !fiveHundred.value) return ''
  return buildShareText({
    team: selectedTeam.value,
    remaining: remaining.value,
    champion: champion.value,
    climaxSeries: climaxSeries.value,
    fiveHundred: fiveHundred.value,
  })
})

const shareStatus = ref<'idle' | 'sharing'>('idle')

/**
 * 結果をシェアする。画像の添付を必須として扱う（可能な環境では常に添付する）。
 *
 * ボタンのラベルには "X" を出さない（"𝕏 でシェア" のような表記にしない）。
 * navigator.share は OS 標準の共有シートを開くものであり、どのアプリに渡すかは
 * 常にユーザーが選ぶ（Web サイト側が「X に決め打ちで直接渡す」ことは仕様上できない）。
 * そのためこの経路は「必ず X に行く」とは言い切れず、"X" を名乗るとできないことを
 * できるかのように書くことになる。画像を渡せない環境では X Web Intent で実際に X へ
 * 直接遷移するが、その場合もボタン自体の文言は変えない（環境によって表記を出し分けると、
 * それ自体が複雑さの割に本質的な解決にならないため、常に宛先を確約しない表記に統一する）。
 *
 * navigator.share が画像ファイルの共有に対応している環境（主にモバイル）では、
 * 結果画像を自動生成して text と一緒に共有シートへ渡す。共有シートで X を選べば
 * 画像付きの投稿になる。Web Share API の仕様上 files と url は同時に渡せないため、
 * URL は text の末尾に含める。
 *
 * navigator.share / canShare が無い環境（主にデスクトップブラウザ）では、画像を
 * 添付する技術的な手段が存在しない（X Web Intent は URL ベースで画像の事前添付に
 * 対応していない）ため、その場合に限りテキスト＋URLのみで X Web Intent を新しいタブに開く。
 */
async function shareResult() {
  if (typeof window === 'undefined' || !selectedTeamId.value) return
  const team = selectedTeamId.value
  const shareUrl = buildShareUrl(window.location.origin, selectedTeamId.value)

  const nav = navigator as Navigator & { canShare?: (data?: ShareData) => boolean }
  const supportsFileShare = typeof nav.share === 'function' && typeof nav.canShare === 'function'

  if (supportsFileShare && shareImageData.value) {
    shareStatus.value = 'sharing'
    try {
      const blob = await renderShareImagePng(shareImageData.value)
      track('share_image_generate', { team })
      const file = new File([blob], 'pennant-calculator.png', { type: 'image/png' })
      if (nav.canShare?.({ files: [file] })) {
        await nav.share({ files: [file], text: `${shareText.value}\n${shareUrl}` })
        return // 画像付きで共有シートを開けた（実際に投稿するかはユーザー次第）
      }
    } catch (error) {
      // ユーザーが共有シートをキャンセルした場合は、Web Intent へのフォールバックはしない
      if (error instanceof DOMException && error.name === 'AbortError') return
      // それ以外（画像生成失敗など）は下のテキストのみ共有にフォールバックする
    } finally {
      shareStatus.value = 'idle'
    }
  }

  const intentUrl = buildTwitterIntentUrl(shareText.value, shareUrl)
  track('share_x_click', { team })
  window.open(intentUrl, '_blank', 'noopener,noreferrer')
}
</script>

<template>
  <div class="page">
    <header class="header">
      <h1 class="h1">NPB Vまであとどのくらい？</h1>
      <p v-if="asOfLabel" class="meta">
        {{ asOfLabel }}終了時点の順位表{{ asOfStatusNote }}
        <span v-if="fetchedAtLabel" class="sub">（{{ fetchedAtLabel }} 取得）</span>
      </p>
    </header>

    <div v-if="error" class="alert bad">
      <p class="alert-title">最新の勝敗表を取得できませんでした。</p>
      <p>時間を置いて再読み込みしてください。</p>
      <button class="button" type="button" :disabled="status === 'pending'" @click="refresh()">
        再読み込み
      </button>
    </div>

    <template v-if="data">
      <label class="picker">
        <span class="picker-label">球団を選択</span>
        <select v-model="selectedTeamId" class="select">
          <option value="">-- 球団を選んでください --</option>
          <optgroup v-for="league in leagues" :key="league" :label="LEAGUE_LABEL[league]">
            <option v-for="team in teamsOfLeague(league)" :key="team.id" :value="team.id">
              {{ team.name }}
            </option>
          </optgroup>
        </select>
      </label>

      <p v-if="!selectedTeam" class="hint">
        球団を選ぶと、優勝・CS進出・勝率5割に「あと何勝」必要かを表示します。
      </p>

      <template v-if="selectedTeam && standing && fiveHundred">
        <section class="current">
          <h2 class="team-name">{{ selectedTeam.name }}</h2>
          <p class="rank">
            {{ rank?.rank }}位<span v-if="rank?.tied" class="tie-mark">タイ</span>
            <span class="league">{{ LEAGUE_LABEL[selectedTeam.league] }}</span>
          </p>
          <p class="record">
            {{ standing.wins }}勝{{ standing.losses }}敗<template v-if="standing.ties > 0">{{ standing.ties }}分</template>
          </p>
          <p class="record-sub">
            勝率 {{ formatWinningPercentage(standing.winningPercentage) }} ／ {{ standing.games }}試合消化 ／
            残り{{ remaining }}試合
          </p>
        </section>

        <ScenarioCard
          v-if="champion"
          icon="🏆"
          title="優勝"
          :status-label="rankStatusLabel(champion.status)"
          :tone="statusTone(champion.status)"
        >
          <template v-if="champion.status === 'eliminated'">
            <p class="headline">可能性なし</p>
            <p class="note">残り{{ remaining }}試合を全勝しても1位に届きません。</p>
          </template>
          <template v-else-if="champion.clinchWins === 0">
            <p class="headline">優勝確定</p>
            <p class="note">他球団の結果によらず1位です。</p>
          </template>
          <template v-else>
            <dl class="lines">
              <div class="line">
                <dt>最短ライン</dt>
                <dd>
                  <strong class="big">{{ winsPhrase(champion.possibleWins) }}</strong>
                  <span v-if="champion.possibleWins" class="line-sub">
                    残り{{ remaining }}試合 {{ champion.possibleWins }}勝{{ lossesFor(champion.possibleWins) }}敗なら優勝の可能性あり
                  </span>
                  <span class="caveat">※他球団の結果次第（自力確定ではありません）</span>
                </dd>
              </div>
              <div class="line">
                <dt>確定ライン</dt>
                <dd>
                  <template v-if="champion.clinchWins !== null">
                    <strong class="big">{{ winsPhrase(champion.clinchWins) }}</strong>
                    <span v-if="champion.clinchWins" class="line-sub">
                      {{ champion.clinchWins }}勝{{ lossesFor(champion.clinchWins) }}敗以上なら
                    </span>
                    <span class="caveat">※{{ clinchNote(champion) }}</span>
                  </template>
                  <template v-else>
                    <span class="line-sub">残り全勝でも単独で確定できません（他球団の結果次第）</span>
                  </template>
                </dd>
              </div>
            </dl>
            <div v-if="championConditions.length" class="conditions">
              <p class="conditions-title">勝数ごとに、優勝の可能性が残るために他球団が同時に満たす必要がある条件</p>
              <div class="conditions-scroll">
                <table class="conditions-table">
                  <thead>
                    <tr>
                      <th scope="col">勝数</th>
                      <th scope="col">他球団への条件</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="row in championConditions" :key="row.wins">
                      <td class="nowrap">{{ row.wins }}勝{{ row.losses }}敗</td>
                      <td>{{ formatConditions(row) }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p class="conditions-note">
                勝数が多いほど他球団への条件は緩くなります。
                <template v-if="championConditions.at(-1)?.clinched">
                  表の最下段まで到達すれば、他球団の結果によらず優勝が確定します。
                </template>
                <template v-else>
                  残り{{ remaining }}試合を全勝しても、他球団の結果次第では優勝を逃す可能性が残ります。
                </template>
              </p>
            </div>
          </template>
        </ScenarioCard>

        <ScenarioCard
          v-if="climaxSeries"
          icon="🎫"
          title="CS進出（3位以内）"
          :status-label="rankStatusLabel(climaxSeries.status)"
          :tone="statusTone(climaxSeries.status)"
        >
          <template v-if="climaxSeries.status === 'eliminated'">
            <p class="headline">可能性なし</p>
            <p class="note">残り{{ remaining }}試合を全勝しても3位以内に届きません。</p>
          </template>
          <template v-else-if="climaxSeries.clinchWins === 0">
            <p class="headline">CS進出確定</p>
            <p class="note">他球団の結果によらず3位以内です。</p>
          </template>
          <template v-else>
            <dl class="lines">
              <div class="line">
                <dt>最短ライン</dt>
                <dd>
                  <strong class="big">{{ winsPhrase(climaxSeries.possibleWins) }}</strong>
                  <span v-if="climaxSeries.possibleWins" class="line-sub">
                    残り{{ remaining }}試合 {{ climaxSeries.possibleWins }}勝{{ lossesFor(climaxSeries.possibleWins) }}敗なら3位以内の可能性あり
                  </span>
                  <span class="caveat">※他球団の結果次第（自力確定ではありません）</span>
                </dd>
              </div>
              <div class="line">
                <dt>確定ライン</dt>
                <dd>
                  <template v-if="climaxSeries.clinchWins !== null">
                    <strong class="big">{{ winsPhrase(climaxSeries.clinchWins) }}</strong>
                    <span v-if="climaxSeries.clinchWins" class="line-sub">
                      {{ climaxSeries.clinchWins }}勝{{ lossesFor(climaxSeries.clinchWins) }}敗以上なら
                    </span>
                    <span class="caveat">※{{ clinchNote(climaxSeries) }}</span>
                  </template>
                  <template v-else>
                    <span class="line-sub">残り全勝でも単独で確定できません（他球団の結果次第）</span>
                  </template>
                </dd>
              </div>
            </dl>
            <div v-if="climaxConditions.length" class="conditions">
              <p class="conditions-title">勝数ごとに、3位以内の可能性が残るために他球団が同時に満たす必要がある条件</p>
              <div class="conditions-scroll">
                <table class="conditions-table">
                  <thead>
                    <tr>
                      <th scope="col">勝数</th>
                      <th scope="col">他球団への条件</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="row in climaxConditions" :key="row.wins">
                      <td class="nowrap">{{ row.wins }}勝{{ row.losses }}敗</td>
                      <td>{{ formatConditions(row) }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p class="conditions-note">
                勝数が多いほど他球団への条件は緩くなります。
                <template v-if="climaxConditions.at(-1)?.clinched">
                  表の最下段まで到達すれば、他球団の結果によらず3位以内が確定します。
                </template>
                <template v-else>
                  残り{{ remaining }}試合を全勝しても、他球団の結果次第では3位以内を逃す可能性が残ります。
                </template>
              </p>
            </div>
          </template>
        </ScenarioCard>

        <ScenarioCard
          icon="⚖️"
          title="勝率5割"
          :status-label="fiveHundredStatusLabel(fiveHundred.status)"
          :tone="statusTone(fiveHundred.status)"
        >
          <template v-if="fiveHundred.status === 'eliminated'">
            <p class="headline">可能性なし</p>
            <p class="note">
              残り{{ remaining }}試合を全勝しても {{ fiveHundred.finalWins }}勝{{ fiveHundred.finalLosses }}敗
              （{{ formatWinningPercentage(fiveHundred.finalPercentage) }}）です。
            </p>
          </template>
          <template v-else-if="fiveHundred.requiredWins === 0">
            <p class="headline">残り全敗でも5割以上</p>
            <p class="note">
              残り{{ remaining }}試合を全敗しても
              {{ standing.wins }}勝{{ standing.losses + remaining }}敗で勝率5割以上です。
            </p>
          </template>
          <template v-else>
            <p class="headline">あと{{ fiveHundred.requiredWins }}勝</p>
            <p class="note">
              {{ fiveHundred.requiredWins }}勝{{ lossesFor(fiveHundred.requiredWins ?? 0) }}敗<br>
              → 最終 {{ fiveHundred.finalWins }}勝{{ fiveHundred.finalLosses }}敗<template
                v-if="fiveHundred.finalTies > 0"
              >{{ fiveHundred.finalTies }}分</template><br>
              → 勝率 {{ formatWinningPercentage(fiveHundred.finalPercentage) }}
            </p>
            <p v-if="fiveHundred.achievedNow" class="caveat">
              ※現在は勝率5割以上（{{ formatWinningPercentage(fiveHundred.currentPercentage) }}）ですが、
              維持にはあと{{ fiveHundred.requiredWins }}勝必要です。
            </p>
          </template>
        </ScenarioCard>

        <ProjectionTable :rows="projection" :remaining="remaining" :marks="projectionMarks" />

        <section class="share">
          <h2 class="share-title">結果をシェア</h2>

          <button
            type="button"
            class="share-button"
            :disabled="shareStatus === 'sharing'"
            @click="shareResult"
          >
            {{ shareStatus === 'sharing' ? '画像を準備中…' : 'シェアする' }}
          </button>

          <ShareImagePanel v-if="shareImageData" :image-data="shareImageData" :team="selectedTeamId" />
        </section>

        <section class="notes">
          <h2 class="notes-title">計算の前提</h2>
          <ul>
            <li>勝率 = 勝 ÷ (勝 + 敗)。引き分けは分母に含めません（NPB方式）。</li>
            <li>残り試合数 = {{ TOTAL_GAMES }} − 消化試合数。</li>
            <li>必要勝数は今後の引き分けを0として計算しています（引き分けが出た場合は必要勝数が増えることはありません）。</li>
            <li v-if="headToHeadKnown">
              NPB公式の日程・結果ページから終了済みカードを集計し、残りの直接対決数を復元したうえで「A球団が勝てばB球団が負ける」という依存関係を考慮しています。
            </li>
            <li v-else>
              残りの直接対決数を確認できなかったため、確定ラインは安全側（厳しめ）に計算しています。
            </li>
            <li v-if="tieBreakSensitive">
              同率の場合は順位決定規定により変動する可能性があります。確定ラインは同率を「こちらが下位」として扱っています。
            </li>
            <li>
              出典:
              <a :href="standings?.sourceUrl" target="_blank" rel="noopener">NPB公式 試合結果ページ</a>
              （試合中の途中経過は含みません）
            </li>
          </ul>
        </section>
      </template>
    </template>
    <footer class="support">
      <a
        class="support-link"
        href="https://buymeacoffee.com/yametoma"
        target="_blank"
        rel="noopener noreferrer"
      >
        <img src="/bmc.png" alt="Buy me a coffee" width="1090" height="306" />
      </a>
    </footer>
  </div>
</template>

<style scoped>
.page {
  max-width: 560px;
  margin: 0 auto;
  padding: 16px 14px 48px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.header {
  margin-bottom: 2px;
}

.support {
  display: flex;
  justify-content: center;
  margin-top: 10px;
}

.support-link {
  display: block;
  width: 220px;
  max-width: 100%;
  border-radius: 12px;
}

.support-link:focus-visible {
  outline: 2px solid var(--text);
  outline-offset: 4px;
}

.support-link img {
  display: block;
  width: 100%;
  height: auto;
}

.h1 {
  font-size: 1.25rem;
  margin: 0;
}

.meta {
  margin: 4px 0 0;
  color: var(--muted);
  font-size: 0.82rem;
}

.sub {
  white-space: nowrap;
}

.alert {
  border-radius: 12px;
  padding: 14px;
  border: 1px solid var(--line);
}

.alert.bad {
  background: #3b1220;
  border-color: var(--bad);
}

.alert.warn {
  background: #3a2f10;
  border-color: var(--warn);
}

.alert p {
  margin: 0 0 6px;
}

.alert-title {
  font-weight: 700;
}

.button {
  margin-top: 6px;
  background: var(--panel-2);
  color: var(--text);
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 8px 14px;
  font-size: 0.9rem;
}

.picker {
  display: block;
}

.picker-label {
  display: block;
  font-size: 0.85rem;
  color: var(--muted);
  margin-bottom: 4px;
}

.select {
  width: 100%;
  font-size: 1rem;
  padding: 12px 10px;
  border-radius: 10px;
  background: var(--panel);
  color: var(--text);
  border: 1px solid var(--line);
}

.hint {
  color: var(--muted);
  font-size: 0.9rem;
  margin: 0;
}

.current {
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 14px;
}

.team-name {
  font-size: 1.15rem;
  margin: 0 0 4px;
}

.rank {
  margin: 0;
  font-size: 1.6rem;
  font-weight: 700;
  line-height: 1.2;
}

.tie-mark {
  font-size: 0.9rem;
  margin-left: 4px;
  color: var(--warn);
}

.league {
  font-size: 0.78rem;
  color: var(--muted);
  font-weight: 400;
  margin-left: 8px;
}

.record {
  margin: 6px 0 0;
  font-size: 1.15rem;
  font-weight: 600;
}

.record-sub {
  margin: 2px 0 0;
  color: var(--muted);
  font-size: 0.85rem;
}

.headline {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 700;
}

.note {
  margin: 6px 0 0;
  font-size: 0.92rem;
}

.caveat {
  display: block;
  margin-top: 4px;
  color: var(--muted);
  font-size: 0.78rem;
}

.lines {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.line {
  display: flex;
  gap: 10px;
  align-items: flex-start;
}

.line dt {
  flex: none;
  width: 5.2em;
  font-size: 0.82rem;
  color: var(--muted);
  padding-top: 4px;
}

.line dd {
  margin: 0;
  flex: 1;
}

.big {
  font-size: 1.35rem;
  display: block;
  line-height: 1.3;
}

.line-sub {
  display: block;
  font-size: 0.85rem;
  color: var(--text);
}

.conditions {
  margin-top: 12px;
  border-top: 1px dashed var(--line);
  padding-top: 10px;
}

.conditions-title {
  margin: 0 0 8px;
  font-size: 0.82rem;
  color: var(--muted);
}

.conditions-scroll {
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

.conditions-table {
  width: 100%;
  min-width: 280px;
  border-collapse: collapse;
  font-size: 0.85rem;
}

.conditions-table th,
.conditions-table td {
  padding: 6px 8px 6px 0;
  text-align: left;
  border-bottom: 1px solid var(--line);
  vertical-align: top;
}

.conditions-table th {
  color: var(--muted);
  font-weight: 600;
  font-size: 0.78rem;
}

.conditions-note {
  margin: 8px 0 0;
  font-size: 0.78rem;
  color: var(--muted);
}

.share {
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.share-title {
  font-size: 1rem;
  margin: 0;
}

.share-button {
  width: 100%;
  padding: 12px 14px;
  border-radius: 10px;
  border: 1px solid var(--line);
  background: var(--panel-2);
  color: var(--text);
  font-size: 0.95rem;
  font-weight: 600;
}

.share-button:disabled {
  opacity: 0.6;
}

.notes {
  color: var(--muted);
  font-size: 0.78rem;
}

.notes-title {
  font-size: 0.85rem;
  margin: 0 0 4px;
  color: var(--text);
}

.notes ul {
  margin: 0;
  padding-left: 1.1em;
}

.notes li {
  margin-bottom: 3px;
}
</style>
