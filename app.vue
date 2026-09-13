<template>
  <NuxtPage />
</template>

<style>
:root {
  --bg: #0f172a;
  --panel: #1e293b;
  --panel-2: #273449;
  --line: #334155;
  --text: #f8fafc;
  --muted: #94a3b8;
  --good: #34d399;
  --ok: #60a5fa;
  --warn: #fbbf24;
  --bad: #f87171;
  color-scheme: dark;
}

* {
  box-sizing: border-box;
}

html,
body {
  margin: 0;
  padding: 0;
  background: var(--bg);
  color: var(--text);
  font-family: -apple-system, BlinkMacSystemFont, 'Hiragino Sans', 'Noto Sans JP', 'Yu Gothic',
    sans-serif;
  line-height: 1.6;
  -webkit-text-size-adjust: 100%;
}

a {
  color: var(--ok);
}
</style>
