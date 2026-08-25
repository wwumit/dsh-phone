# Changelog

## [2.1.0] - 2026-08-25

### Added — 配置运行时化 + agent profile
- **client.js 一份通用**：身份/线路号/端点不再构建时注入，改由 node 半经 `webServer.tapIndex` 注入 `window.__DSH_PHONE_CONFIG__`，client 半启动读全局——不再按环境（dshlib/wwu-mac/volcano）各建一份，根治构建污染
- **agent profile（RCS 业务档案）**：rcs-server 新增 `agent_profiles` 表 + `GET/PUT /api/v1/agent/profile`；client 新增 profile 导入脚本，展示名优先 RCS 档案、回退 registry 注册名（属性/动作之外的第三层，刷新重拉）
- **本地态按 DID 命名空间化**（`agentKey`）：theme/unlocked/note/pos/group-read + node 半游标文件按 agent DID 隔离，切号零痕迹（微信模型）；旧全局游标文件一次性迁移

### Fixed
- **发消息静默失败**：`account` 状态提升到 PhoneOverlay 共享（此前 sendGroup/sendSms 跨作用域引用 → ReferenceError）
- **数字员工不处理 @号码**：node 半 `isMentionedMe` 识别名下号码（群成员按号码存时 @号码也触发）
- **B 面板号码身份**：归一化 `NUM_B`（此前带空格号码 → 400 invalid from）
- **残留硬编码**：清除 `/phone` 命令 dshlib/term-a/term-b 快捷联系人、用量页硬编码标题

## [2.0.0] - 2026-08-25

### Added — message protocol v2 (major)
- **Text length 10k** (was 2000); long content via text attachments (`attachment.kind=text` + `chars`) — agent reads full text into LLM context (up to 50k chars, truncated beyond)
- **@ mention gate granularity**: partially-denied mentions now deliver to allowed agents + return `denied` list; only all-denied returns 409 `TRUST_GATE_DENIED`
- **Message state machine**: `status` (active/recalled/deleted), `deliveredAt`, `readAt`; recall endpoint `POST /message/recall` (sender-only, 403 otherwise)
- **Agent capability declaration**: `metadata.capabilities` on register; exposed in `members-detail`; `@` selector shows capability tags
- **Structured messages**: `kind=card` + `payload` (title/fields/actions) — validated (card without payload → 400)
- **Group message history pagination**: `GET /group/<id>/messages?since=&limit=` (aggregates all member inboxes)
- **Unified error format**: `{error, code, detail}` across message paths
- **Reply attribution**: `[agent回复·<short>]` prefix + `agent: {did, name, level}` field (multi-agent groups distinguishable)

### Fixed
- **Broadcast excludes sender** (self-DID and self-fromNumber no longer receive own messages)
- **@ self no longer delivers** to own session (sendSmsToAgent + sendGroup double guard)
- **node half resolveSession**: falls back through registry `alternatives` when primary session is stale (restart changes session id → was stuck "session not found", no replies)
- **Signal TTL 5min**: stale offer/candidate from inbox no longer retriggers ringing on refresh
- **Own level from `trust/query`** (DID document has no top-level level)
- **Group messages via pagination endpoint** (not own-inbox filter) — own sent messages stay visible/right-aligned
- **All hardcoded numbers/DIDs removed** (env-driven only); STUN server derived from PHONE_BASE (DSH_PHONE_STUN overridable); removed dead `CALLER_NUM`

## [1.0.0] - 2026-08-24
