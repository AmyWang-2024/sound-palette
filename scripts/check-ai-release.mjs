import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const errors = []
const warnings = []

function read(path) {
  return readFileSync(join(root, path), 'utf8')
}

function readJson(path) {
  return JSON.parse(read(path))
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

const requiredDocs = [
  'docs/ai/AI_M1_MANUAL_TEST.md',
  'docs/ai/AI_M2_MOCK_SERVICE.md',
  'docs/ai/AI_M3_SECURITY_EVIDENCE.md',
  'docs/ai/AI_M4_EVALUATION_AND_LABELS.md',
  'docs/ai/AI_M5_RELEASE_GATES.md',
  'docs/ai/AI_PRIVACY_DRAFT.md',
  'docs/ai/AI_TERMS_DRAFT.md',
  'docs/ai/AI_REVIEW_SUBMISSION_DRAFT.md',
  'docs/ai/AI_OPERATIONS_RUNBOOK.md',
  'docs/ai/AI_RELEASE_EVIDENCE.json',
]

for (const path of requiredDocs) {
  requireCondition(existsSync(join(root, path)), `缺少 AI 发布材料：${path}`)
}

const aiCoreFiles = walk(join(root, 'packages', 'ai-core', 'src'))
const guardedMiniFiles = [
  join(root, 'miniprogram', 'config', 'ai-feature.ts'),
  ...walk(join(root, 'miniprogram', 'pages')),
]
const source = [...aiCoreFiles, ...guardedMiniFiles]
  .filter((path) => /\.(?:ts|js|json|wxml)$/.test(path))
  .map((path) => readFileSync(path, 'utf8'))
  .join('\n')
const miniFeatureConfig = read('miniprogram/config/ai-feature.ts')
const aiConfig = read('packages/ai-core/src/config.ts')
const rolloutConfig = read('packages/ai-core/src/rollout-control.ts')

requireCondition(
  /AI_FEATURE_ENABLED\s*=\s*false/.test(miniFeatureConfig) &&
    /AI_REAL_PROVIDER_ENABLED\s*=\s*false/.test(miniFeatureConfig),
  '小程序 AI feature flag 或真实 provider 默认值不是 false。',
)
requireCondition(
  /enabled:\s*false[\s\S]*allowRealProviders:\s*false/.test(aiConfig),
  'AI core 默认配置没有同时关闭功能与真实 provider。',
)
requireCondition(
  /enabled:\s*false[\s\S]*killSwitch:\s*true[\s\S]*percentage:\s*0/.test(
    rolloutConfig,
  ),
  'AI 灰度默认配置必须是关闭、kill switch 开启、0%。',
)
requireCondition(
  !/\b(?:fetch|XMLHttpRequest|WebSocket)\s*\(|wx\.(?:login|request|uploadFile)\s*\(/.test(
    source,
  ),
  '默认关闭的 AI 源码出现真实网络或平台登录调用。',
)
requireCondition(
  !/\b(?:AppSecret|session_key|OPENAI_API_KEY|DASHSCOPE_API_KEY)\b\s*[:=]/.test(
    source,
  ),
  'AI 源码疑似包含真实密钥或微信秘密字段。',
)
requireCondition(
  !/\bwx[a-f0-9]{16}\b/i.test(source),
  'AI 源码中疑似出现真实 AppID。',
)

let evidence = { gates: [] }
if (existsSync(join(root, 'docs/ai/AI_RELEASE_EVIDENCE.json'))) {
  evidence = readJson('docs/ai/AI_RELEASE_EVIDENCE.json')
}

const automaticPassed = evidence.gates
  .filter(
    (gate) =>
      gate.status === 'passed' && gate.evidenceKind === 'automatic',
  )
  .map((gate) => gate.gateId)
const blocking = evidence.gates
  .filter((gate) => gate.status !== 'passed')
  .map((gate) => gate.gateId)
const unexpectedExternalPasses = evidence.gates.filter(
  (gate) =>
    gate.status === 'passed' &&
    gate.evidenceKind !== 'automatic' &&
    gate.gateId !== 'local-zero-network',
)

if (unexpectedExternalPasses.length > 0) {
  warnings.push(
    '证据文件包含外部通过项；必须人工核验附件，脚本本身不能证明真机、平台或供应商结果。',
  )
}

const result = {
  status:
    errors.length > 0
      ? 'failed'
      : blocking.length > 0
        ? 'blocked-external-gates'
        : 'requires-administrator-verification',
  aiFeatureDefault: false,
  realProvidersDefault: false,
  killSwitchDefault: true,
  rolloutPercentageDefault: 0,
  automaticPassed,
  blocking,
  errors,
  warnings,
}

console.log(JSON.stringify(result, null, 2))

if (errors.length > 0) {
  process.exitCode = 1
}
