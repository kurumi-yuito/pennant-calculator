<script setup lang="ts">
import { formatWinningPercentage } from '~/lib/record'
import type { ProjectionRow } from '~/lib/scenario'

defineProps<{
  rows: ProjectionRow[]
  remaining: number
  marks: (row: ProjectionRow) => string[]
}>()
</script>

<template>
  <section class="wrap">
    <h2 class="title">残り{{ remaining }}試合の想定</h2>
    <div class="scroll">
      <table class="table">
        <thead>
          <tr>
            <th scope="col">残り</th>
            <th scope="col">最終成績</th>
            <th scope="col">勝率</th>
            <th scope="col">到達</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.wins">
            <td class="nowrap">{{ row.wins }}勝{{ row.losses }}敗</td>
            <td class="nowrap">
              {{ row.finalWins }}勝{{ row.finalLosses }}敗<template v-if="row.finalTies > 0">{{ row.finalTies }}分</template>
            </td>
            <td class="nowrap num">{{ formatWinningPercentage(row.percentage) }}</td>
            <td>
              <span v-for="mark in marks(row)" :key="mark" class="mark">{{ mark }}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<style scoped>
.wrap {
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 14px;
}

.title {
  font-size: 1rem;
  margin: 0 0 8px;
}

.scroll {
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

.table {
  width: 100%;
  min-width: 300px;
  border-collapse: collapse;
  font-size: 0.88rem;
}

th,
td {
  padding: 6px 4px;
  text-align: left;
  border-bottom: 1px solid var(--line);
}

th {
  color: var(--muted);
  font-weight: 600;
  font-size: 0.8rem;
}

.nowrap {
  white-space: nowrap;
}

.num {
  font-variant-numeric: tabular-nums;
}

.mark {
  display: inline-block;
  font-size: 0.72rem;
  padding: 1px 6px;
  margin: 1px 2px 1px 0;
  border-radius: 999px;
  background: var(--panel-2);
  border: 1px solid var(--line);
  white-space: nowrap;
}
</style>
