export type TempFileCleanupStatus =
  | 'not-created'
  | 'deleted'
  | 'already-missing'
  | 'unconfirmed'
  | 'failed'

export interface TempFileCleanupResult {
  status: TempFileCleanupStatus
  attempts: number
  error: string
}

interface FileSystemError {
  errMsg?: string
}

export interface TempFileSystem {
  unlink(options: {
    filePath: string
    success: () => void
    fail: (error: FileSystemError) => void
  }): void
  access(options: {
    path: string
    success: () => void
    fail: (error: FileSystemError) => void
  }): void
}

interface CleanupOptions {
  retryDelaysMs?: readonly number[]
  wait?: (delayMs: number) => Promise<void>
}

type FilePresence = 'exists' | 'missing' | 'unknown'

const DEFAULT_RETRY_DELAYS_MS = [0, 120, 400, 1_000] as const

function defaultWait(delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs)
  })
}

function errorMessage(error: FileSystemError): string {
  return typeof error.errMsg === 'string' ? error.errMsg : ''
}

export function isMissingFileError(message: string): boolean {
  const normalized = message.toLowerCase()
  return (
    normalized.includes('no such file') ||
    normalized.includes('not found') ||
    normalized.includes('fail file not exist') ||
    normalized.includes('不存在')
  )
}

export function classifyCleanupError(message: string): string {
  const normalized = message.toLowerCase()
  if (isMissingFileError(normalized)) {
    return '文件已不存在'
  }
  if (
    normalized.includes('busy') ||
    normalized.includes('locked') ||
    normalized.includes('being used')
  ) {
    return '文件仍被系统占用'
  }
  if (
    normalized.includes('permission') ||
    normalized.includes('denied') ||
    normalized.includes('not permitted')
  ) {
    return '微信文件权限拒绝'
  }
  return '微信文件状态无法确认'
}

function checkFilePresence(
  fileSystem: TempFileSystem,
  filePath: string,
): Promise<{ presence: FilePresence; error: string }> {
  return new Promise((resolve) => {
    fileSystem.access({
      path: filePath,
      success: () => resolve({ presence: 'exists', error: '' }),
      fail: (error) => {
        const message = errorMessage(error)
        resolve({
          presence: isMissingFileError(message) ? 'missing' : 'unknown',
          error: message,
        })
      },
    })
  })
}

function unlinkOnce(
  fileSystem: TempFileSystem,
  filePath: string,
): Promise<{ deleted: boolean; error: string }> {
  return new Promise((resolve) => {
    fileSystem.unlink({
      filePath,
      success: () => resolve({ deleted: true, error: '' }),
      fail: (error) =>
        resolve({ deleted: false, error: errorMessage(error) }),
    })
  })
}

export async function cleanupTempFile(
  fileSystem: TempFileSystem,
  tempFilePath: string | undefined,
  options: CleanupOptions = {},
): Promise<TempFileCleanupResult> {
  if (!tempFilePath) {
    return {
      status: 'not-created',
      attempts: 0,
      error: '',
    }
  }

  const retryDelaysMs =
    options.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS
  const wait = options.wait ?? defaultWait
  let lastError = ''
  let sawUnknownPresence = false

  for (let index = 0; index < retryDelaysMs.length; index += 1) {
    await wait(retryDelaysMs[index])
    const unlinkResult = await unlinkOnce(fileSystem, tempFilePath)

    if (unlinkResult.deleted) {
      return {
        status: 'deleted',
        attempts: index + 1,
        error: '',
      }
    }

    lastError = unlinkResult.error
    if (isMissingFileError(lastError)) {
      return {
        status: 'already-missing',
        attempts: index + 1,
        error: '',
      }
    }

    const presence = await checkFilePresence(fileSystem, tempFilePath)
    if (presence.presence === 'missing') {
      return {
        status: 'already-missing',
        attempts: index + 1,
        error: '',
      }
    }
    if (presence.presence === 'unknown') {
      sawUnknownPresence = true
      lastError = presence.error || lastError
    }
  }

  return {
    status: sawUnknownPresence ? 'unconfirmed' : 'failed',
    attempts: retryDelaysMs.length,
    error: classifyCleanupError(lastError),
  }
}
