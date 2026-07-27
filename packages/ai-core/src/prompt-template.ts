import { RECIPE_IDS, type Mood, type RecipeId, type SoundVisualInput } from '../../core/src'
import { AiGenerationError } from './errors'
import { sanitizeStructuredSoundCaption } from './structured-caption'
import type { StructuredSoundCaption } from './types'

export const AI_IMAGE_WIDTH = 864
export const AI_IMAGE_HEIGHT = 1152
export const AI_IMAGE_STEPS = 8

export interface DeterministicImagePrompt {
  version: 1
  prompt: string
  negativePrompt: string
  promptHash: string
  seed: number
  width: typeof AI_IMAGE_WIDTH
  height: typeof AI_IMAGE_HEIGHT
  steps: typeof AI_IMAGE_STEPS
  promptExtend: false
  recipeDirection: RecipeId
}

const MOOD_DIRECTIONS: Record<Mood, string> = {
  good: '明亮、舒展、温暖，但保留声音结构',
  neutral: '平衡、克制、中性光线，层次清楚',
  low: '冷静、收拢、低明度，但不过度阴郁',
}

const RECIPE_DIRECTIONS: Record<RecipeId, string> = {
  'concentric-field': '同心场与缓慢扩散的环形秩序',
  'flowing-ribbons': '连续流动的半透明色带',
  'particle-constellation': '疏密有序的颗粒星群与连线',
  'layered-paper': '柔软叠放的纸面层次与留白',
  'vertical-rain': '纵向雨幕般的细线和节奏',
  'radial-pulse': '从中心向外的径向脉冲',
  'fractured-grid': '克制的碎片网格与错位边缘',
  'calm-horizon': '平静地平线与缓慢水平层次',
}

function stableHash(value: string): string {
  let hash = 0x811c9dc5

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }

  return (hash >>> 0).toString(16).padStart(8, '0')
}

function quantize(value: number): number {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new AiGenerationError('INVALID_REQUEST')
  }

  return Math.round(value * 100)
}

function chooseRecipeDirection(
  jobId: string,
  summary: SoundVisualInput,
): RecipeId {
  const structural = [
    quantize(summary.loudness),
    quantize(summary.lowEnergy),
    quantize(summary.midEnergy),
    quantize(summary.highEnergy),
    quantize(summary.changeRate),
  ].join(':')
  const hash = stableHash(`${jobId}:${structural}`)
  const index = Number.parseInt(hash.slice(0, 4), 16) % RECIPE_IDS.length

  return RECIPE_IDS[index]
}

function join(values: string[], fallback: string): string {
  return values.length > 0 ? values.join('、') : fallback
}

export function createDeterministicImagePrompt(input: {
  jobId: string
  caption: StructuredSoundCaption
  mood: Mood
  summary: SoundVisualInput
}): DeterministicImagePrompt {
  if (
    !/^[A-Za-z0-9_-]{8,80}$/.test(input.jobId) ||
    !['good', 'neutral', 'low'].includes(input.mood)
  ) {
    throw new AiGenerationError('INVALID_REQUEST')
  }

  const caption = sanitizeStructuredSoundCaption(input.caption)
  const recipeDirection = chooseRecipeDirection(input.jobId, input.summary)
  const soundNumbers = {
    loudness: quantize(input.summary.loudness),
    low: quantize(input.summary.lowEnergy),
    mid: quantize(input.summary.midEnergy),
    high: quantize(input.summary.highEnergy),
    change: quantize(input.summary.changeRate),
  }
  const prompt = [
    '创作一幅 Sound Palette 品牌的竖幅抽象声音画。',
    `环境线索：${join(caption.environment, '环境不确定')}。`,
    `声音来源：${join(caption.sources, '模糊环境声')}。`,
    `动态：${join(caption.dynamics, '连续')}；空间：${join(caption.spatial, '层次不确定')}。`,
    `材质：${join(caption.materials, '半透明、细颗粒')}。`,
    `构图方向：${RECIPE_DIRECTIONS[recipeDirection]}。`,
    `Mood：${MOOD_DIRECTIONS[input.mood]}。`,
    `声音控制值（百分制）：响度 ${soundNumbers.loudness}，低频 ${soundNumbers.low}，中频 ${soundNumbers.mid}，高频 ${soundNumbers.high}，变化 ${soundNumbers.change}。`,
    '统一使用雾化叠色、柔和边缘、细颗粒和克制留白；抽象、可分享，不表现具体人物。',
  ].join(' ')
  const negativePrompt = [
    '文字',
    '标志',
    '水印',
    '界面',
    '数据图表',
    '写实人物',
    '人脸',
    '逐字内容',
    '二维码',
    '低清晰度',
    '过度锐化',
    '杂乱拼贴',
  ].join('，')
  const promptHash = stableHash(
    JSON.stringify({
      version: 1,
      prompt,
      negativePrompt,
      recipeDirection,
    }),
  )

  return {
    version: 1,
    prompt,
    negativePrompt,
    promptHash,
    seed: Number.parseInt(promptHash, 16) >>> 0,
    width: AI_IMAGE_WIDTH,
    height: AI_IMAGE_HEIGHT,
    steps: AI_IMAGE_STEPS,
    promptExtend: false,
    recipeDirection,
  }
}
