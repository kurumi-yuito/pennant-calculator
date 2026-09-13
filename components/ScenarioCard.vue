<script setup lang="ts">
import type { StatusTone } from '~/lib/labels'

defineProps<{
  icon: string
  title: string
  statusLabel: string
  tone: StatusTone
}>()
</script>

<template>
  <section class="card" :class="`tone-${tone}`">
    <header class="head">
      <h2 class="title"><span class="icon">{{ icon }}</span>{{ title }}</h2>
      <span class="badge">{{ statusLabel }}</span>
    </header>
    <div class="body">
      <slot />
    </div>
  </section>
</template>

<style scoped>
.card {
  background: var(--panel);
  border: 1px solid var(--line);
  border-left: 6px solid var(--tone-color, var(--line));
  border-radius: 12px;
  padding: 14px 14px 16px;
}

.tone-good {
  --tone-color: var(--good);
}
.tone-ok {
  --tone-color: var(--ok);
}
.tone-warn {
  --tone-color: var(--warn);
}
.tone-bad {
  --tone-color: var(--bad);
}

.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.title {
  font-size: 1.05rem;
  margin: 0;
  display: flex;
  align-items: center;
  gap: 6px;
}

.icon {
  font-size: 1.2rem;
}

.badge {
  flex: none;
  font-size: 0.85rem;
  font-weight: 700;
  padding: 2px 10px;
  border-radius: 999px;
  color: var(--bg);
  background: var(--tone-color, var(--muted));
}

.body {
  margin-top: 10px;
}
</style>
