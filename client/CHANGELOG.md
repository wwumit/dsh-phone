# Changelog

## [2.5.4] - 2026-09-02

### Added · 通用消息签名（P1-5，验证优先/缺省开）
- **对端验签能力**：任何带 `payload.signature` 的入站消息（结构化 payload 或纯文本）由收方验证
  发送方签名（resolve 发送方 DID → #agent-key → Ed25519）。验签对象规则：
  ① 结构化 payload（除 signature）② 纯文本消息 → `{text}`；发送方无 #agent-key → 显示未签名不误报
- **SigBadge 通用验签徽章**（✓ 已验签 / ⚠ 签名验证失败：内容可能被篡改），替代并删除收款码
  专用 recharge-badge（统一为单一验签实现，防漂移）
- **发送侧带签**：短信/群消息（agent 身份）经本机签名服务签 `{text}` 随 payload 发出
- **策略**：结构化消息必验（安全）；纯文本验签有开关（负担开关预留，当前默认开）
- 渐进：签名失败（无 #agent-key / 签名服务不可达）不阻断发送（发无签消息），待 agent 全量注册
  #agent-key 后收紧为必签
- 验证：8098 签名 → registry #agent-key 解析 → Ed25519 验签端到端通过（篡改被拒）；CI（tsc + test 12/12 + build）

## [2.5.3] - 2026-09-02

### Quality / 类型安全（P1-4）
- **CI 类型检查门禁**：tsc --noEmit 加入 CI（此前 esbuild 构建抓不到 type-only 错误）
- 修复 25+ 条真实 tsc 错误：import 路径错、createGroup/onCreate/sendGroup 签名统一、
  group.tsx/index.tsx 7+7 处空值守卫、recharge 类型补全（purchase yuan1 / upload size——
  服务端上传响应实测含 size）、webcrypto Ed25519 cast 等
- 平台模块类型 stub（src/types/platform-stubs.d.ts）：宿主 @deepseek-ai/* 模块 CI/发布环境
  无源码，本仓库可独立 tsc 0 错（构建仍 external）

### 内部（P1-6）
- **canonicalJson 单一实现**：sign.ts / webcrypto.ts 两份逐字重复 → src/canonical-json.ts 共享
  （消除跨端漂移风险）；新增 8 项确定性测试（排序/嵌套/数组/unicode/签名往返/稳定性向量），
  CI 跑 npm test

### Changed
- **STORE_URL 跟随 registryBase**（此前写死 compliancehub.cn）：换服务域名时商店地址自动跟随；
  仍可用 storeUrl 显式覆盖
- **轮询游标不再落 /tmp**（DSH_HOME 缺省 → HOME/.dsh，与身份文件同路径）：系统清理不再
  导致游标归零重放历史回复
- README 更新：版本 2.5.3 + 充值（2.4）/签名收款码（2.5）功能 + P0 安全说明

## [2.5.2] - 2026-09-02

### Security
- **签名服务 CORS Origin 白名单**（P0-1）：node 半签名端点（127.0.0.1:8098 /sign）从
  `Access-Control-Allow-Origin: *` 改为 Origin 校验——env `DSH_PHONE_SIGN_ALLOW_ORIGIN`
  精确源，未配置时默认放行 localhost/127.0.0.1 源，其余 Origin 一律 403。
  堵死"任意网页可让本机 agent 私钥签任意 payload"的签名预言机路径。
- **部署脚本脱敏**（P0-2）：`scripts/release.sh`（含生产主机信息）移出公开仓库为本地私有
  副本；公开仓仅保留 `release.sh.example` 脱敏模板。生产主机 SSH 已改密钥认证。

### Fixed
- **新消息横幅点击必崩**（P0-3）：横幅 jump 引用 PhonePanel 内部 `nav`（组件外越界 →
  ReferenceError）。面板 nav 现经 `registerNav` 暴露给外层，跳转经面板注册导航执行。

## [2.5.1] - 2026-09-02

### Fixed
- **board/沙箱 localStorage 安全**：saveRead（群读取进度）、主题初始化/onUnlock/onSelectTheme 的
  localStorage 读写加 try-catch——OpenClaw board 最内层 sandbox iframe 禁 localStorage 时
  不再抛 SecurityError 中断 UI
- **createGroup 自动包含创建者**：服务端不自动加 creator，建群后创建者不再缺失（此前退群
  报 member not in group）
- **package.json 中文逗号笔误**（2.5.0 引入，修正）
- **package-lock 多平台化**：darwin + linux-x64 binding（rolldown/yuku-codegen/yuku-parser）
  双入 lock——CI/linux 上 npm ci 不再缺 native binding（npm/cli#4828 同类）

### CI
- GitHub Actions build workflow（push/PR：npm ci → tsdown 双半构建 → 产物完整性）

## [2.5.0] - 2026-09-01

### Added
- **充值发码签名（防替换）**：B 侧 `sendQr` 调 node 半签名服务（回环 8098，`POST /sign`，Ed25519 #agent-key 私钥）签订单级 payload（订单/金额/codeUrl/附件hash/ts）；签名随消息 payload 发出
- **A 侧验签徽章**：收码消息自动 resolve 发送方 DID → 取 #agent-key（multibase+multicodec）→ WebCrypto 验签 + 查信任等级/撤销 → 显示「✓ 已验签·订单xxx」或「⚠ 验签失败·疑似被替换·勿扫码」
- **webcrypto.ts**：base58btc 解码 + raw Ed25519 验签原语（与 node 半/registry 格式对齐）
- **浮标默认底部中间 + 手机容器视口居中**（截图/演示友好；拖动仍可自定义位置）

### Fixed
- **本机 agent 回复显示在左侧**：群消息 mine 判定加 `m.agent.did === AGENT_DID`；短信 isMine 加 `fromNumber === AGENT_DID`——dshlib 手机上 dshlib 的回复显示右侧（其他 agent 回复仍左侧）
- **浮标收起**：点浮标恢复 toggle（打开/收起；此前改成只开不关）——展开后点浮标可收起
- **agent 回复不实时出现在群聊**：广播排除发送者导致自己/agent 发的群消息不在自己收件箱，inbox 轮询拉不到、只能刷新才见 → 当前打开群时轮询顺带增量拉群历史（group/:id/messages?since=）

## [2.4.0] - 2026-08-28（已发布 npm）

### Added — 额度充值（X402 微信支付）+ 402 体验修复
- **充值页**（`recharge`，system app，RCS 群列表顶部「充值」进入）：余额展示 → 选套餐 → X402 微信 Native 下单 → 客户端 QR 渲染（qrcode-generator 内联）→ 3s 轮询 confirm 自动入账 → 余额刷新；超时留「我已支付」手动确认；金额由服务端定价（客户端只传 pack，防篡改）
- **套餐三档**：¥1 = 200（标准汇率）/ ¥10 = 2200（赠 200）/ ¥100 = 23000（赠 3000）
- **RCS 群列表余额角标**：顶部显示当前额度 + 充值入口
- **发送失败不再"假成功"**：sendSms 检查响应状态，402/错误弹提示；sendGroup 包 try/catch，失败保留草稿
- **新消息通知横幅（微信式）**：轮询到新短信/群消息 → 浮窗顶部横幅（发送者/群名 + 摘要）6 秒自动消失，点击跳转对应会话（群 → 打开该群，短信 → 短信页）；正在看对应会话时不弹；信令消息不弹
- **余额查询禁用缓存**：registry `GET /credits` 原返回 `Cache-Control: max-age=300` → 充值后 5 分钟内查询命中旧缓存、余额不刷新（已服务端修 no-store + 客户端请求统一 `cache: 'no-store'` 双保险）
- **修复：点通知横幅跳群导致浮窗消失（崩溃）**：通知跳转未等群详情加载就导航，GroupChatApp 在 currentGroup=null 时提前 return 导致 hooks 数量变化 → React 卸载浮窗。已修：跳转先 `await openGroup` 再导航 + GroupChatApp hooks 依赖改可选链、空态移到所有 hooks 之后（hooks 恒定）
- **修复：点浮标（圆形📞按钮）浮窗关闭**：原为 toggle（开着时再点即关）→ 改为点浮标只打开/置顶，关闭走浮窗内 ▁ 最小化按钮
- **修复：通知横幅跨组件引用导致浮窗打开即崩溃（"浮标一点就消失"根因）**：notif 状态定义在 PhoneOverlay、横幅却渲染在 PhonePanel（引用未定义变量 → ReferenceError）；viewRef 定义在 PhonePanel、轮询却在其上层 PhoneOverlay 引用。已修：notif 经 props 下发 PhonePanel 渲染，viewRef 移除、抑制判断改用共享的 currentGroup
- **主题解锁改免费**：积分消费端点已加服务端鉴权（客户端不可用）→ 解锁改本地免费解锁
- 新增 `api.purchase / confirmPayment / ledger`；`consumeCredits` 移除（服务端已鉴权）

## [2.3.1] - 2026-08-28

### Fixed — QR 生成 API
- qrcode-generator 2.0.4 的 API 为 `createDataURL`（原写 `toDataURL` 运行时 TypeError，充值页打开即崩）——已修复并发布

## [2.2.0] - 2026-08-27

### Added — Agent 身份自证（M1-M3）+ 浏览器端密钥
- agent 本地生成 Ed25519 密钥对，仅登记公钥到 registry（`agent/key/register`），私钥不出设备
- 身份文件 `~/.dsh/identity-<did>.json`（chmod 600）：node 半自动开户（无身份文件时静默开户，失败降级 env）
- 出站签名能力：`agentSign` / `agentHasKey` 导出（RFC 8785 风格 canonicalJson + Ed25519）
- 浏览器端 `webcrypto.ts`：WebCrypto Ed25519（spki 公钥格式，与 node 半/服务端互通）——P7 SaaS 向导底座
- 回归：跨端互操作（WebCrypto ↔ node ↔ registry 验签）+ 身份文件闭环验证通过

## [2.1.1] - 2026-08-26

### Fixed — npm 包完整性
- 补 `README.md`（含坦诚声明）、`LICENSE`（MIT）、`CHANGELOG.md`
- 开 dts 生成类型声明：`lib/index.d.ts`（node 半），修正 `types`/`exports` 路径
- `files` 加入 `lib/index.d.ts` + `CHANGELOG.md`

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
