import seedrandom from 'seedrandom'
import type { Mood, SoundSummary } from './types'

export interface ArtworkTags {
  structure: string
  movement: string
  mood: string
}

function stableChoice(
  choices: readonly string[],
  seed: string,
  category: string,
): string {
  const random = seedrandom(`${seed}:${category}`)
  return choices[Math.floor(random() * choices.length)]
}

function structureTag(summary: SoundSummary): string {
  if (summary.quiet) {
    return stableChoice(['安静', '留白'], summary.seed, 'structure-quiet')
  }

  const composition = [
    { id: 'base', value: summary.composition.base },
    { id: 'flow', value: summary.composition.flow },
    { id: 'sparkle', value: summary.composition.sparkle },
  ].sort((left, right) => right.value - left.value)

  if (composition[0].value - composition[2].value <= 0.12) {
    return '层次均衡'
  }

  if (composition[0].id === 'base') {
    return '厚重基底'
  }

  if (composition[0].id === 'flow') {
    return '持续流动'
  }

  return '明亮细节'
}

function movementTag(summary: SoundSummary): string {
  if (summary.changeRate < 0.3) {
    return '缓慢'
  }

  if (summary.changeRate < 0.62) {
    return '流动'
  }

  return stableChoice(
    ['跳跃', '起伏明显'],
    summary.seed,
    'movement-active',
  )
}

function moodTag(summary: SoundSummary, mood: Mood): string {
  const choices: Record<Mood, readonly string[]> = {
    good: ['舒展', '清亮', '有生气'],
    neutral: ['日常', '平稳', '观察中'],
    low: ['下沉', '收拢', '沉静'],
  }

  return stableChoice(choices[mood], summary.seed, `mood-${mood}`)
}

export function createArtworkTags(
  summary: SoundSummary,
  mood: Mood,
): ArtworkTags {
  return {
    structure: structureTag(summary),
    movement: movementTag(summary),
    mood: moodTag(summary, mood),
  }
}
