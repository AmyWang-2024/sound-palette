export const AI_ERROR_CODES = [
  'AI_FEATURE_DISABLED',
  'AUTH_REQUIRED',
  'CONSENT_REQUIRED',
  'INVALID_AUDIO',
  'INSUFFICIENT_CREDITS',
  'USER_LIMITED',
  'PROJECT_BUDGET_EXHAUSTED',
  'CAPTION_TIMEOUT',
  'IMAGE_TIMEOUT',
  'CONTENT_REJECTED',
  'PROVIDER_UNAVAILABLE',
  'RESULT_EXPIRED',
  'IDEMPOTENCY_CONFLICT',
  'INVALID_REQUEST',
  'JOB_NOT_FOUND',
  'UPLOAD_AUTH_EXPIRED',
  'JOB_STATE_CONFLICT',
  'JOB_CANCELED',
  'CAPTION_INVALID_RESPONSE',
  'AUDIO_DELETE_UNCONFIRMED',
] as const

export type AiErrorCode = (typeof AI_ERROR_CODES)[number]

export const AI_SAFE_MESSAGES: Record<AiErrorCode, string> = {
  AI_FEATURE_DISABLED: 'AI 声音画尚未开放，可以使用本地声纹画。',
  AUTH_REQUIRED: '需要重新连接微信账户。',
  CONSENT_REQUIRED: 'AI 隐私说明已更新，请重新确认。',
  INVALID_AUDIO: '这段声音未能完整读取，请重新录音。',
  INSUFFICIENT_CREDITS: 'AI 次数不足，可以使用本地声纹画。',
  USER_LIMITED: '今日尝试较多，请稍后再试或使用本地声纹画。',
  PROJECT_BUDGET_EXHAUSTED: 'AI 今日暂时繁忙，可以使用本地声纹画。',
  CAPTION_TIMEOUT: '暂时没能理解这段声音，可以使用本地声纹画。',
  IMAGE_TIMEOUT: '画面仍在生成，可以稍后回来查看。',
  CONTENT_REJECTED: '这次无法完成 AI 生成，可以使用本地声纹画。',
  PROVIDER_UNAVAILABLE: 'AI 服务暂不可用，可以使用本地声纹画。',
  RESULT_EXPIRED: '临时作品已过期，请重新录音。',
  IDEMPOTENCY_CONFLICT: '任务标识与原请求不一致，请重新开始。',
  INVALID_REQUEST: '请求信息不完整，请重新开始。',
  JOB_NOT_FOUND: '没有找到这次生成任务，请重新开始。',
  UPLOAD_AUTH_EXPIRED: '上传确认已过期，请重新开始。',
  JOB_STATE_CONFLICT: '任务状态已经变化，请刷新后重试。',
  JOB_CANCELED: '已取消这次 AI 生成。',
  CAPTION_INVALID_RESPONSE: '暂时没能安全理解这段声音，可以使用本地声纹画。',
  AUDIO_DELETE_UNCONFIRMED: '无法确认临时声音已删除，本次结果已丢弃。',
}

export class AiGenerationError extends Error {
  readonly code: AiErrorCode

  constructor(code: AiErrorCode) {
    super(AI_SAFE_MESSAGES[code])
    this.name = 'AiGenerationError'
    this.code = code
  }
}
