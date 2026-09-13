import type { ScenarioStatus } from './scenario'

export type StatusTone = 'good' | 'ok' | 'warn' | 'bad'

/** 優勝・CS カード用のラベル（色だけに頼らず、必ず文字でも状態を示す） */
export function rankStatusLabel(status: ScenarioStatus): string {
  switch (status) {
    case 'clinched':
      return '確定'
    case 'possible':
      return '可能'
    case 'tough':
      return '厳しい'
    case 'eliminated':
      return '消滅'
  }
}

/** 勝率5割カード用のラベル */
export function fiveHundredStatusLabel(status: ScenarioStatus): string {
  switch (status) {
    case 'clinched':
      return '達成確定'
    case 'possible':
      return '可能'
    case 'tough':
      return '厳しい'
    case 'eliminated':
      return '消滅'
  }
}

export function statusTone(status: ScenarioStatus): StatusTone {
  switch (status) {
    case 'clinched':
      return 'good'
    case 'possible':
      return 'ok'
    case 'tough':
      return 'warn'
    case 'eliminated':
      return 'bad'
  }
}
