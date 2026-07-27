# AI-M2 账户、额度与任务服务说明

## 当前交付边界

本阶段交付的是纯内存、纯本地、可重复测试的服务契约，不是生产服务器：

- feature flag 默认关闭；
- 不调用 `wx.login`，登录码只作为固定 mock 输入；
- 不发起 HTTP、WebSocket、上传或模型请求；
- 不保存 OpenID、`session_key`、AppSecret、供应商密钥、PCM、声音描述或提示词；
- 不修改小程序页面，不向用户开放 AI 入口；
- 所有记录在进程结束后消失，不能用于生产。

## 已实现契约

| API 语义 | 本地 mock 方法 | 行为 |
|---|---|---|
| `POST /v1/auth/wechat` | `authenticateWechat` | 建立最小账户，返回业务 token，不返回微信标识 |
| `GET /v1/account/credits` | `getCredits` | 返回 available、reserved、累计赠送/消耗和版本 |
| `POST /v1/generations` | `createGeneration` | 校验同意、限速、预算并原子预占，返回 202 |
| `PUT .../audio` | `uploadMockAudio` | 只接收字节数、格式和校验摘要，不接收 PCM |
| `GET .../generations/{id}` | `getGeneration` | 恢复同一任务，不重复调用 provider |
| `POST .../cancel` | `cancelGeneration` | 模型启动前释放；已启动任务继续并允许恢复 |
| `POST .../regenerate` | `regenerate` | 要求新 job ID 与未过期 caption token，单独预占 |
| `POST .../finalize` | `finalize` | 返回固定合规占位结果，按 job + version 幂等且不扣费 |

## 额度与失败规则

- 新账户赠送额度、用户日上限、项目日预算和各 TTL 均来自配置；
- 创建任务成功后先从 available 移到 reserved；
- Captioner 失败、内容拒绝、服务失败、取消、上传授权过期和最终图像超时会释放；
- 图像处理中超时先保持预占并允许恢复，达到最终超时后再释放；
- 得到可恢复图片后结算一次，客户端断开不退款也不重复调用；
- 同一 job ID 与相同输入返回同一任务；输入不同返回幂等冲突；
- 流水只包含用户、job、固定类型、金额、原因码和时间。

## 自动验证

AI-M2 测试覆盖：

- 默认关闭时零账户与零 provider 调用；
- 最小账户与受保护微信主体；
- 202、一次性模拟上传授权、元数据与模拟音频分离；
- 幂等创建、原子预占、并发额度边界、用户限速和项目预算；
- 成功结算、Caption/Image 失败释放、图像超时恢复与最终释放；
- 取消、上传授权过期、客户端断开恢复和结果 TTL；
- 新 job ID 再生成、caption 复用、单图单次计费；
- `finalize` 幂等且不重复扣费；
- 有限轮询；
- 审计事件不含登录码、声音摘要、PCM 校验摘要、caption 或 prompt；
- `packages/ai-core` 不含真实网络客户端、微信平台登录调用或嵌入密钥。

AI-M3 之前不得把 `uploadMockAudio` 描述为真实上传，不得配置供应商凭证，也不得声称已经
部署账户或任务服务。
