# AI-M3 Caption 与临时声音安全证据

## 结论边界

AI-M3 已完成可在仓库内验证的安全模拟实现，但没有完成真实服务门禁：

- 使用合成 `Uint8Array` 验证 PCM 生命周期，不使用用户录音；
- 临时数据只在当前 Node 进程内存中，不写文件、对象存储或数据库；
- Qwen3-Omni 只是默认关闭的候选适配器，transport 由测试注入；
- 没有供应商凭证、生产地域、真实保留条款、成本、延迟或删除 API 证据；
- 没有部署上传端点，也没有修改小程序 AI 入口；
- 因此不得宣称真实声音已上传、真实 Qwen 已调用或供应商侧已完成删除。

## 结构化 Caption 防线

固定结构只允许：

- environment 最多 3 项；
- sources 最多 5 项；
- dynamics 和 materials 各最多 4 项；
- spatial 最多 3 项；
- 单项最长 18 个字符；
- confidence 仅 low / medium / high；
- containsSpeech 仅布尔值。

输出过滤：

- 删除手机号、长数字、邮箱、微信号、QQ、地址、门牌、账号等信息；
- 删除逐字引用、姓名线索、性别/年龄/身份和情绪诊断；
- `containsSpeech=true` 时 sources 只返回“近处有人声”，不保留谈话内容；
- low confidence 强制使用“环境不确定 / 模糊环境声”；
- JSON 或结构错误只允许一次受控修复，仍失败则返回固定错误码；
- Pipeline 会再次校验 provider 返回值，不能依赖 TypeScript 类型绕过运行时过滤。

## 临时 PCM 生命周期

只有 `consentConfirmed=true` 才能创建临时 PCM：

- 最大 512,000 Byte；
- 最大 TTL 十分钟；
- 复制到内存，provider 只收到不可读内容的临时 token，不收到 Base64；
- 主动删除前先把内存缓冲区覆零；
- 删除证据只记录 job ID、原因、状态、时间和固定错误码；
- 删除状态无法确认时抛出 `AUDIO_DELETE_UNCONFIRMED` 并丢弃 Caption 结果。

自动测试覆盖：

| 路径 | 期望删除原因 | 结果 |
|---|---|---|
| Caption 成功 | `caption_succeeded` | 删除后才返回结果 |
| Provider 失败 | `caption_failed` | 删除并返回固定错误 |
| 用户取消 | `canceled` | provider 调用前也删除 |
| Caption 超时 | `timeout` | 删除并释放上层额度 |
| 十分钟兜底 | `ttl` | sweep 删除并留证 |
| 删除失败 | 原路径原因 + failed | 丢弃结果，阻塞真实发布 |

## Qwen 候选适配器

- 候选模型标识为 `Qwen3-Omni-30B-A3B-Captioner`；
- 默认 `enabled=false` 且 `verifiedMainlandRegion=false`；
- 只有两个开关都由测试显式打开时才调用注入 transport；
- 仅声明为瞬断的 transport 错误允许一次重试；
- 结构修复最多一次；
- provider request ID 只保留安全字符并限制长度；
- 延迟与成本汇总函数已测试，但当前数据是固定 mock，不是性能结论。

## 进入真实验证前所需证据

1. 国内服务地域和官方能力确认；
2. 独立服务端、HTTPS、密钥托管和最小权限；
3. 成功、失败、取消、超时四路径的服务端删除日志；
4. 供应商数据保留与训练使用条款；
5. 至少 30 次真实网络测试的成功率、P50、P95 和单次成本；
6. 人声、静音、街道、雨、自然、音乐、突发和低频固定样本安全复核；
7. 删除不能证明时自动释放额度并回退本地版。

以上证据未齐前，AI-M3 的真实供应商门禁保持未通过。
