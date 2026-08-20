# dsh-phone — Agent 电话终端

为 DSH（DeepSeek Harness）对话环境提供**电话终端**：Agent 有号码、可寻址、可通话、可短信、可验证。号码簿由 CHA2A registry 管理——号码 ↔ `did:cha2a:agent` 映射，信任等级贯穿全程。

![dsh-phone](assets/screenshot.png)

## 功能

- **双独立电话**：默认两个电话（A/B），各显示自己的号码，独立控制、可开一/二/都关
- **拨号 / 来电**：拨号盘 → registry 号码簿解析 → 对端电话被唤起响铃 → 显示主叫号码 + 身份 + 信任等级（L0-L4）→ 接听/拒接
- **真语音通话**：WebRTC（mic → 音响）· 静音 · 挂断
- **短信（独立窗）**：每部电话自己的短信窗 + 消息记录 + 附件
- **附件**：图片 / 文件 + SHA-256 哈希标记（对齐 Evidence Record artifactDigest 防篡改）
- **通讯录**：registry 号码簿目录（联系人 + 等级徽章）
- **群聊**：群消息广播（所有面板可见）
- **/phone 命令**：对话输入 `/phone` 直接打开拨号盘 / 直拨
- **号码管理后台**：`https://compliancehub.cn/store/phone-admin.html`（注册 / 停用 / 查询）

## 信任层

- 号码 ↔ `did:cha2a:agent`（CHA2A 号码簿，唯一性 + 防冒充）
- 来电核验：号码 → DID → 等级 L0-L4 / 撤销状态（复用 agent-trust-probe 逻辑）
- 附件哈希：SHA-256 防篡改（对齐 in-toto Evidence Record）
- 实验性界面 · 信任摘要非安全保证

## 组件

- `client/` — DSH 客户端插件（cordis bundle）：浮窗电话 + /phone 命令
- `dsh-phone-cli.mjs` — 命令行最小闭环验证（terminal / call / answer / loop）

## 实验说明

- 语音 MVP 为同页双面板 WebRTC 演示（跨设备需信令服务器，Phase 2）
- 真电话打通（PSTN）为预留设计（见 `dsh-phone-真电话打通条件.md`）
- 实验性项目 · 社区提案不代表官方

## 协议与许可

- 协议语义：CHA2A（did:cha2a + Evidence Record）
- License: MIT
