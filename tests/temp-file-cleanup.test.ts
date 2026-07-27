import { describe, expect, it } from 'vitest'
import {
  cleanupTempFile,
  type TempFileSystem,
} from '../miniprogram/lib/temp-file-cleanup'

type Result = 'ok' | string

function fakeFileSystem(
  unlinkResults: Result[],
  accessResults: Result[] = [],
): TempFileSystem {
  let unlinkIndex = 0
  let accessIndex = 0

  return {
    unlink({ success, fail }) {
      const result =
        unlinkResults[Math.min(unlinkIndex, unlinkResults.length - 1)]
      unlinkIndex += 1
      if (result === 'ok') {
        success()
      } else {
        fail({ errMsg: result })
      }
    },
    access({ success, fail }) {
      const result =
        accessResults[Math.min(accessIndex, accessResults.length - 1)]
      accessIndex += 1
      if (result === 'ok') {
        success()
      } else {
        fail({ errMsg: result })
      }
    },
  }
}

const noWait = () => Promise.resolve()

describe('temporary recorder file cleanup', () => {
  it('reports when WeChat did not create a temporary file', async () => {
    const result = await cleanupTempFile(
      fakeFileSystem(['ok']),
      undefined,
      { wait: noWait },
    )

    expect(result).toEqual({
      status: 'not-created',
      attempts: 0,
      error: '',
    })
  })

  it('confirms a successful unlink', async () => {
    const result = await cleanupTempFile(
      fakeFileSystem(['ok']),
      'wxfile://recording.pcm',
      { retryDelaysMs: [0], wait: noWait },
    )

    expect(result).toEqual({
      status: 'deleted',
      attempts: 1,
      error: '',
    })
  })

  it('accepts only an explicit missing-file error as already deleted', async () => {
    const result = await cleanupTempFile(
      fakeFileSystem(['unlink:fail busy'], ['access:fail file not exist']),
      'wxfile://recording.pcm',
      { retryDelaysMs: [0], wait: noWait },
    )

    expect(result).toEqual({
      status: 'already-missing',
      attempts: 1,
      error: '',
    })
  })

  it('retries a busy file and succeeds without retaining its path', async () => {
    const result = await cleanupTempFile(
      fakeFileSystem(['unlink:fail file busy', 'ok'], ['ok']),
      'wxfile://recording.pcm',
      { retryDelaysMs: [0, 0], wait: noWait },
    )

    expect(result).toEqual({
      status: 'deleted',
      attempts: 2,
      error: '',
    })
  })

  it('does not misreport permission errors as a missing file', async () => {
    const result = await cleanupTempFile(
      fakeFileSystem(
        ['unlink:fail permission denied'],
        ['access:fail permission denied'],
      ),
      'wxfile://recording.pcm',
      { retryDelaysMs: [0, 0], wait: noWait },
    )

    expect(result).toEqual({
      status: 'unconfirmed',
      attempts: 2,
      error: '微信文件权限拒绝',
    })
  })
})
