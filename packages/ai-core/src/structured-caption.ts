import { AiGenerationError } from './errors'
import type { StructuredSoundCaption } from './types'

type CaptionField =
  | 'environment'
  | 'sources'
  | 'dynamics'
  | 'materials'
  | 'spatial'

const FIELD_LIMITS: Record<CaptionField, number> = {
  environment: 3,
  sources: 5,
  dynamics: 4,
  materials: 4,
  spatial: 3,
}

const MAX_PHRASE_LENGTH = 18
const PII_PATTERN =
  /(?:(?:\+?86[- ]?)?1[3-9](?:[- ]?\d){9}|\b\d{7,}\b|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|微信(?:号)?|QQ|手机号|电话|身份证|住址|地址|门牌|账号)/i
const TRANSCRIPT_PATTERN =
  /(?:他说|她说|对话内容|谈话内容|逐字|原话|姓名|叫做|名叫|“[^”]+”|"[^"]+")/
const IDENTITY_PATTERN =
  /(?:男性|女性|男声|女声|男孩|女孩|老人|青年|年龄|情绪诊断|抑郁|焦虑)/
const SPEECH_SOURCE_PATTERN = /(?:说话|谈话|对话|人声|语音|讲话)/

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function safePhrase(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const cleaned = value
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (
    !cleaned ||
    PII_PATTERN.test(cleaned) ||
    TRANSCRIPT_PATTERN.test(cleaned) ||
    IDENTITY_PATTERN.test(cleaned)
  ) {
    return null
  }

  return cleaned.slice(0, MAX_PHRASE_LENGTH)
}

function safePhrases(
  value: unknown,
  field: CaptionField,
  containsSpeech: boolean,
): string[] {
  if (!Array.isArray(value)) {
    return []
  }

  const unique = new Set<string>()
  for (const candidate of value) {
    const phrase = safePhrase(candidate)
    if (
      !phrase ||
      (containsSpeech && SPEECH_SOURCE_PATTERN.test(phrase))
    ) {
      continue
    }
    unique.add(phrase)
    if (unique.size >= FIELD_LIMITS[field]) {
      break
    }
  }

  return [...unique]
}

function isCaptionShape(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) {
    return false
  }

  return (
    value.version === 1 &&
    ['environment', 'sources', 'dynamics', 'materials', 'spatial'].every(
      (field) => Array.isArray(value[field]),
    ) &&
    ['low', 'medium', 'high'].includes(String(value.confidence)) &&
    typeof value.containsSpeech === 'boolean'
  )
}

function parseUnknown(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value
  }

  return JSON.parse(value)
}

export function sanitizeStructuredSoundCaption(
  value: unknown,
): StructuredSoundCaption {
  if (!isCaptionShape(value)) {
    throw new AiGenerationError('CAPTION_INVALID_RESPONSE')
  }

  const containsSpeech = value.containsSpeech as boolean
  const confidence = value.confidence as StructuredSoundCaption['confidence']
  const caption: StructuredSoundCaption = {
    version: 1,
    environment: safePhrases(
      value.environment,
      'environment',
      containsSpeech,
    ),
    sources: safePhrases(value.sources, 'sources', containsSpeech),
    dynamics: safePhrases(value.dynamics, 'dynamics', containsSpeech),
    materials: safePhrases(value.materials, 'materials', containsSpeech),
    spatial: safePhrases(value.spatial, 'spatial', containsSpeech),
    confidence,
    containsSpeech,
  }

  if (containsSpeech) {
    caption.sources = ['近处有人声']
  }

  if (confidence === 'low') {
    caption.environment = ['环境不确定']
    caption.sources = containsSpeech ? ['近处有人声'] : ['模糊环境声']
  }

  return caption
}

export async function parseStructuredSoundCaption(
  raw: unknown,
  repair?: (rawValue: unknown) => Promise<unknown> | unknown,
): Promise<StructuredSoundCaption> {
  try {
    return sanitizeStructuredSoundCaption(parseUnknown(raw))
  } catch (error) {
    if (!repair) {
      throw error instanceof AiGenerationError
        ? error
        : new AiGenerationError('CAPTION_INVALID_RESPONSE')
    }
  }

  try {
    const repaired = await repair(raw)
    return sanitizeStructuredSoundCaption(parseUnknown(repaired))
  } catch {
    throw new AiGenerationError('CAPTION_INVALID_RESPONSE')
  }
}
