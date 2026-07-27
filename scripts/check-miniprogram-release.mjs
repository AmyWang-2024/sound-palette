import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const errors = []
const warnings = []

function readJson(path) {
  return JSON.parse(readFileSync(join(root, path), 'utf8'))
}

function walk(directory) {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name)
    return statSync(path).isDirectory() ? walk(path) : [path]
  })
}

function requireCondition(condition, message) {
  if (!condition) {
    errors.push(message)
  }
}

const projectConfig = readJson('project.config.json')
const appConfig = readJson('miniprogram/app.json')
const miniFiles = walk(join(root, 'miniprogram'))
const sourceFiles = miniFiles.filter((path) =>
  /\.(?:ts|js|json|wxml|wxss)$/.test(path),
)
const source = sourceFiles
  .filter((path) => !path.includes(`${join('miniprogram', 'vendor')}`))
  .map((path) => readFileSync(path, 'utf8'))
  .join('\n')
const packageBytes = miniFiles.reduce(
  (total, path) => total + statSync(path).size,
  0,
)

requireCondition(
  projectConfig.appid === 'touristappid',
  'project.config.json 必须保留 touristappid，真实 AppID 只能在本机私有配置。',
)
requireCondition(
  appConfig.permission?.['scope.record']?.desc,
  'app.json 缺少麦克风权限用途。',
)
requireCondition(
  appConfig.permission?.['scope.writePhotosAlbum']?.desc,
  'app.json 缺少相册写入权限用途。',
)
requireCondition(
  !/wx\.(?:request|uploadFile|downloadFile|login)\s*\(/.test(source),
  '当前本地版包含网络或账户调用。',
)
requireCondition(
  !/\.(?:saveFile|writeFile|appendFile)\s*\(/.test(source),
  '当前本地版包含持久化文件调用。',
)
requireCondition(
  !/\bwx[a-f0-9]{16}\b/i.test(source),
  '小程序源码中疑似出现真实 AppID。',
)
requireCondition(
  packageBytes <= 1_500_000,
  `miniprogram 目录 ${packageBytes} Byte，超过 1.5MB 门禁。`,
)

for (const path of [
  'docs/miniprogram/PRIVACY_GUIDE_DRAFT.md',
  'docs/miniprogram/DEVICE_TEST_RECORD.md',
  'docs/miniprogram/REVIEW_SUBMISSION.md',
  'docs/miniprogram/W4_QA_CHECKLIST.md',
  'docs/miniprogram/W5_RELEASE_RUNBOOK.md',
]) {
  requireCondition(existsSync(join(root, path)), `缺少发布材料：${path}`)
}

if (!existsSync(join(root, 'project.private.config.json'))) {
  warnings.push('本机没有 project.private.config.json，无法使用真实 AppID 预览或上传。')
}

const result = {
  status: errors.length === 0 ? 'ready-for-manual-gates' : 'failed',
  miniprogramBytes: packageBytes,
  checkedFiles: sourceFiles.length,
  errors,
  warnings,
  manualGates: [
    'Android 最新构建完整验收',
    'iPhone 最新构建完整验收',
    '公众平台类目确认',
    '小程序备案',
    '最终隐私保护指引配置',
    '体验版验收',
    '提交审核',
    '管理员发布',
  ],
}

console.log(JSON.stringify(result, null, 2))

if (errors.length > 0) {
  process.exitCode = 1
}
