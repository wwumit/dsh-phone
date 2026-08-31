/**
 * dsh-phone node half — Loader 挂载入口。
 * client 插件的运行时职责（浮窗 UI）在 client 半（src/client/index.tsx）；
 * node 半提供挂载标识 + Agent 回复转回（读绑定会话最新消息 → 按来源路由回电话）。
 *
 * 路由原则（来源即目的地）：投递时 client 半在 user 消息带 <dsh-phone>{"source","fromNumber","conversationId"}</dsh-phone>
 * 来源标记；node 半解析最近一个来源标记，把后续 assistant 回复按来源路由回去。
 */
import type { Context } from '@deepseek-ai/cordis'
import fs from 'fs'
import http from 'node:http'
import path from 'path'
// 身份/签名模块（node 半专用——依赖 node:crypto；浏览器半不 import，否则打包进 client 会崩）
import { loadIdentity, createIdentity, markRegistered, identityPath, type AgentIdentity } from './identity'
import { signPayload } from './sign'

export const name = 'dsh-phone'
export const inject = ['sessionQuery', 'webServer']

// 安全读取 env：DSH 加载器（cordis）某些版本无全局 process（报 "Can't find variable: process"）
// → typeof 守卫回退默认值，火山/本地（有 process）与用户机（无 process）都能加载
const hasProcess = typeof process !== 'undefined' && !!process?.env
const env = (k: string, d: string) => (hasProcess ? (process.env[k] || d) : d)

// 安全加载身份文件（node 半才有 fs；浏览器半降级 null → env 路径）
let _identity: AgentIdentity | null = null
function loadIdentitySafe(did: string): AgentIdentity | null {
  if (!hasProcess) return null
  try { _identity = loadIdentity(did); return _identity } catch { return null }
}
export function agentHasKey(): boolean { return !!_identity }
export function agentSign(payload: string | object): string | null {
  if (!_identity) return null
  try { return signPayload(payload, _identity.privateKey) } catch { return null }
}

const PHONE_BASE = env('DSH_PHONE_BASE', 'https://compliancehub.cn')
// RCS 服务基址：消息/群/附件走 rcs-server（nginx /rcs/ 前缀）
const RCS_BASE = PHONE_BASE + '/rcs'
// agent 身份：优先本地身份文件（含私钥，可自证签名）；无则 env 降级（过渡期）
const ENV_DID = env('DSH_PHONE_DID', 'did:cha2a:agent:dshlib')
const identity = loadIdentitySafe(ENV_DID)
const AGENT_DID = identity ? identity.did : ENV_DID
const AGENT_SHORT = AGENT_DID.split(':').pop() || 'dshlib'
// 本环境号码（node 半回短信/群的兜底 fromNumber；运行时读 env，缺省同演示配置）
// 保留原始显示格式（含空格）用于注入给 client；node 半内部用归一化后的 NUM_A/NUM_B
const RAW_NUM_A = env('DSH_PHONE_NUM_A', '+86 95123 0001')
const RAW_NUM_B = env('DSH_PHONE_NUM_B', '+86 95123 0002')
const NUM_A = RAW_NUM_A.replace(/[^0-9+]/g, '')
const NUM_B = RAW_NUM_B.replace(/[^0-9+]/g, '')
// 号码归一化（与 client 半 sendGroup 的 normNum 一致：去 +86 前缀 + 非数字）
function normNum(s: string): string { return String(s || '').replace(/^\+86/, '').replace(/[^0-9]/g, '') }

// ── 客户端配置运行时注入（配置运行时化）──
// 浏览器没有 process.env，身份/线路号/端点由 node 半运行时经 tapIndex 注入 window.__DSH_PHONE_CONFIG__，
// client 半（config.ts）启动时读这个全局。这样 client.js 一份通用，不再按环境构建时烙身份。
interface PhoneRuntimeConfig {
  registryBase: string
  rcsBase: string
  agentDid: string
  numA: string
  numB: string
  signPort?: number   // node 半签名服务端口（回环；缺省时 client 用默认 8098）
}
// 签名服务端口（回环仅本机；env 可覆盖，防端口冲突）
const SIGN_PORT = parseInt(env('DSH_PHONE_SIGN_PORT', '8098'), 10) || 8098
function buildPhoneConfig(): PhoneRuntimeConfig {
  return {
    registryBase: PHONE_BASE,
    rcsBase: RCS_BASE,
    agentDid: AGENT_DID,
    numA: RAW_NUM_A,
    numB: RAW_NUM_B,
    signPort: SIGN_PORT,
  }
}
// 照 DSH 官方 dsh-client-modules 的 injectBootManifest 写法：JSON 转义 < 后注入 <head>
function injectPhoneConfig(html: string, cfg: PhoneRuntimeConfig): string {
  const json = JSON.stringify(cfg).replaceAll('<', '\\u003c')
  const script = `<script>window.__DSH_PHONE_CONFIG__ = ${json}</script>`
  const head = html.indexOf('<head>')
  if (head !== -1) return `${html.slice(0, head + 6)}${script}${html.slice(head + 6)}`
  return `${script}${html}`
}
const REPLY_INTERVAL = 2500          // 轮询间隔（回复路由时延大头，2.5s）
const SEEN_MAX = 200                 // 已处理消息去重上限
// 轮询游标持久化：重启后不重放历史回复（游标按 sid 记录已处理消息数；inbox 记录收件箱 seq）
// 游标文件按 DID 命名空间化（设备通用、各 agent 各一份）；一次性把旧全局文件迁移过来，避免换名后游标归零重放历史回复
const CURSOR_FILE = path.join(env('DSH_HOME', '/tmp'), `dsh-phone-cursor-${AGENT_DID.replace(/[^A-Za-z0-9._-]/g, '_')}.json`)
const OLD_CURSOR_FILE = path.join(env('DSH_HOME', '/tmp'), 'dsh-phone-cursor.json')
try {
  if (!fs.existsSync(CURSOR_FILE) && fs.existsSync(OLD_CURSOR_FILE)) fs.renameSync(OLD_CURSOR_FILE, CURSOR_FILE)
} catch { /* 迁移失败忽略（仅回到新游标，不影响功能） */ }
const INBOX_KEY = 'inbox'           // 收件箱消费者游标键（跨设备投递）

function loadCursor(): Record<string, number> {
  try { return JSON.parse(fs.readFileSync(CURSOR_FILE, 'utf8')) } catch { return {} }
}
function saveCursor(c: Record<string, number>): void {
  try { fs.writeFileSync(CURSOR_FILE, JSON.stringify(c)) } catch { /* 写失败忽略 */ }
}

export function apply(ctx: Context): void {

  // 客户端配置运行时注入：node 半把身份/线路号/端点经 tapIndex 注入 index.html（window.__DSH_PHONE_CONFIG__）
  ctx.effect(
    () => ctx.webServer.tapIndex((html) => injectPhoneConfig(html, buildPhoneConfig())),
    'dsh-phone: config injection',
  )

  // ── Agent 身份自证（地基）：启动时确保本地身份文件存在，无则自动开户 ──
  // 静默增强：无身份文件 → 本地生成密钥对 + 登记公钥到 registry + 写身份文件（chmod 600）
  // 有身份文件或登记失败 → 保持 env 降级路径（不影响现有功能）；失败不阻断启动
  ctx.effect(() => {
    if (!hasProcess) return () => {}   // 浏览器半无 fs/process，跳过
    if (identity) return () => {}      // 已有身份文件，无需开户
    const doOnboard = async () => {
      try {
        const id = createIdentity(AGENT_DID)
        const res = await fetch(`${PHONE_BASE}/api/v1/agent/key/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ did: AGENT_DID, publicKey: id.publicKey, algorithm: 'Ed25519' }),
        }).catch(() => null)
        if (res && res.ok) {
          const data = await res.json().catch(() => null)
          if (data && data.registered) {
            markRegistered(AGENT_DID, data.keyRegisteredAt || new Date().toISOString())
            _identity = loadIdentity(AGENT_DID)
            console.log(`[dsh-phone] ✅ agent 身份已开户: ${AGENT_DID}（本地密钥 + registry 公钥登记）`)
            return
          }
        }
        // 登记失败（409 已登记 / 网络失败）→ 保留本地密钥，env 路径仍工作
        console.log(`[dsh-phone] ⚠ agent 身份文件已建但公钥登记未完成（registry 稍后可补登记），继续 env 模式`)
      } catch (e) {
        console.log(`[dsh-phone] ⚠ agent 开户失败（${String(e).slice(0, 80)}），继续 env 模式`)
      }
    }
    if (hasProcess) { doOnboard() }
    return () => {}
  }, 'dsh-phone: agent key onboarding')

  // ── 签名服务（回环，仅本机）：client 请求 agent 私钥签名（私钥不出 node 半）──
  // 用途：跨 agent 场景「发二维码」——B 侧签订单 payload，A 侧验签可防二维码被替换。
  // 实现：零依赖 node http；CORS 放行（DSH 页面源跨端口调本端点）；POST /sign {payload} → {signature}
  if (hasProcess && identity) {
    const signServer = http.createServer((req, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
      if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return }
      if (req.method === 'POST' && (req.url || '').startsWith('/sign')) {
        let body = ''
        req.on('data', (c) => { body += c })
        req.on('end', () => {
          try {
            const parsed = JSON.parse(body || '{}')
            const sig = agentSign(parsed.payload)
            if (!sig) {
              res.writeHead(500, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ error: 'no identity key' }))
              return
            }
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ ok: true, signature: sig }))
          } catch (e: any) {
            res.writeHead(400, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: String(e?.message || e) }))
          }
        })
        return
      }
      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'not found' }))
    })
    signServer.listen(SIGN_PORT, '127.0.0.1')
    ctx.on('dispose', () => { try { signServer.close() } catch {} })
  }

  // ── Agent 回复转回：读绑定会话最新 assistant 消息 → 按来源路由回电话 ──
  const seen = new Set<string>()
  let lastChecked: Record<string, number> = loadCursor()
  // 状态日志节流：静默状态（无会话/无绑定）每 50 次轮询（~2 分钟）打一条，避免刷屏淹没有用信息
  let quietLogCount = 0
  function quietLog(msg: string): void {
    quietLogCount++
    if (quietLogCount >= 50) { quietLogCount = 0; console.log(`[dsh-phone] ${msg}`) }
  }

  // 解析 <dsh-phone>{json}</dsh-phone> 来源标记（返回 null 表示无标记）
  function parseSource(text: string): { source: string; fromNumber: string; conversationId?: string; groupId?: string } | null {
    const m = text.match(/<dsh-phone>\s*(\{[\s\S]*?\})\s*<\/dsh-phone>/)
    if (!m) return null
    try {
      const d = JSON.parse(m[1])
      if (!d.source || !d.fromNumber) return null
      return { source: d.source, fromNumber: d.fromNumber, conversationId: d.conversationId, groupId: d.groupId }
    } catch { return null }
  }

  // 从 events 提取 {role, text} 序列（user 消息在 data 顶层；assistant 在 data.message）
  function extractMessages(events: any[]): Array<{ role: string; text: string }> {
    const out: Array<{ role: string; text: string }> = []
    for (const e of events) {
      const d = e?.data || {}
      if (e?.type === 'user/message') {
        const text = extractText(d)   // user: data 顶层 {content, source, role, id}
        if (text) out.push({ role: String(d?.role || 'user'), text })
      } else if (e?.type === 'assistant/message') {
        const text = extractText(d?.message)   // assistant: data.message
        if (text) out.push({ role: String(d?.message?.role || 'assistant'), text })
      }
    }
    return out
  }

  async function pollAgentReplies(): Promise<void> {
    try {
      // 1. 从 registry 拿绑定会话
      const loc = await (await fetch(`${PHONE_BASE}/api/v1/agent/locate?did=${encodeURIComponent(AGENT_DID)}`, {
        headers: { Accept: 'application/json' },
      })).json()
      if (!loc || !loc.bound) { quietLog('poll: 无绑定会话（状态日志每~2分钟一条）'); return }
      const sid = await resolveSession(loc)
      if (!sid) { quietLog('poll: 无有效会话（主+alternatives 均失效，状态日志每~2分钟一条）'); return }

      // 2. 读会话消息序列（含 user 来源标记 + assistant 回复）
      const session = await (ctx as any).sessionQuery?.readSession?.(sid)
      if (!session) { quietLog('poll: readSession 失败（状态日志每~2分钟一条）'); return }
      const events = (session as any).events || []
      const msgs = extractMessages(events)


      const seenCount = lastChecked[sid] || 0

      // 3. 追踪最近来源标记：遍历消息，记住每个 user 标记；assistant 回复按最近标记路由
      let currentSource: { source: string; fromNumber: string; groupId?: string; conversationId?: string } | null = null
      let routed = 0
      for (let i = 0; i < msgs.length; i++) {
        const msg = msgs[i]
        // user 消息：解析来源标记并更新当前来源
        if (msg.role.includes('user')) {
          const src = parseSource(msg.text)
          if (src) {
            currentSource = { source: src.source, fromNumber: src.fromNumber, groupId: src.groupId, conversationId: src.conversationId }
          }
          continue
        }
        // assistant 回复：按最近来源标记转回
        if (!msg.role.includes('assistant')) continue
        if (i < seenCount) continue          // 已处理过
        const text = msg.text
        if (!text.trim() || text.length > 10000) continue   // v2: 10k（长内容走文本附件）
        // 不做内容过滤：extractText 已跳过 reasoning 块，text 块即 AI 最终回答（自由模式下不再误杀）
        const key = sid + ':' + i + ':' + text.slice(0, 50)
        if (seen.has(key)) continue
        seen.add(key)
        if (seen.size > SEEN_MAX) seen.delete(seen.values().next().value)

        // 路由：默认回短信（来源 sms）；replyChannel 配置在此扩展（现在默认 auto = 跟随来源）
        const src = currentSource || { source: 'sms', fromNumber: NUM_A }

        if (src.source === 'sms') {
          // 回短信：agent 身份发回（fromNumber=AGENT_DID 代表 agent，任何电话面板判"收到"左侧）；to 规范化 E.164
          const toNum = src.fromNumber.replace(/[^0-9+]/g, '')
          const displayName = ownNickname || AGENT_SHORT
          fetch(`${RCS_BASE}/api/v1/phone/message`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ from: AGENT_DID, fromNumber: AGENT_DID, to: toNum, text: `[agent回复·${displayName}] ${text}`, agent: { did: AGENT_DID, name: displayName, level: ownLevel } }),
          }).catch(() => {})
          routed++
        } else if (src.source === 'group' && src.groupId) {
          // 回群广播（来源=group）：agent 回复广播回群；带 conversationId 保持群级会话语义
          const displayName = ownNickname || AGENT_SHORT
          fetch(`${RCS_BASE}/api/v1/phone/group/message`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ from: AGENT_DID, fromNumber: AGENT_DID, groupId: src.groupId, ...(src.conversationId ? { conversationId: src.conversationId } : {}), text: `[agent回复·${displayName}] ${text}`, agent: { did: AGENT_DID, name: displayName, level: ownLevel } }),
          }).catch(() => {})
          routed++
        }
      }
      lastChecked[sid] = msgs.length
      saveCursor(lastChecked)
      if (routed > 0) console.log(`[dsh-phone] poll: 路由 ${routed} 条回复（sid=${sid.slice(0, 8)} msgs=${msgs.length}）`)
    } catch (e) { console.log('[dsh-phone] poll err:', String(e).slice(0, 120)) }
  }

  // ── 收件箱消费者（跨设备投递桥）：轮询 registry 收件箱（自己的 DID）→ 新消息注入本实例会话 → AI 回复
  // 投递与实例解耦：任何实例 @ 本 agent，消息进收件箱，由本实例 node 半处理
  let ownNickname = ''
  let ownLevel = 0
  let ownNumbers: string[] = [normNum(NUM_A)]
  async function refreshNickname(): Promise<void> {
    try {
      const d = await (await fetch(`${PHONE_BASE}/api/v1/did/${AGENT_DID}`, { headers: { Accept: 'application/json' } })).json()
      ownNickname = (d?.metadata?.name) || (d?.metadata?.author) || ''
      // 等级在 trust/query 端点（did 文档顶层无 level）
      const t = await (await fetch(`${PHONE_BASE}/api/v1/trust/query?did=${encodeURIComponent(AGENT_DID)}`, { headers: { Accept: 'application/json' } })).json()
      ownLevel = Number(t?.level ?? t?.trust?.level) || 0
      // 拉名下所有号码（识别 @号码 点名：群成员常按号码存，@号码也应触发本 agent）
      try {
        const dir = await (await fetch(`${PHONE_BASE}/api/v1/phone/directory`, { headers: { Accept: 'application/json' } })).json()
        ownNumbers = (dir?.numbers || []).filter((n: any) => n.agentDid === AGENT_DID).map((n: any) => normNum(n.number))
        if (!ownNumbers.length) ownNumbers = [normNum(NUM_A)]
      } catch { ownNumbers = [normNum(NUM_A)] }
    } catch { /* 静默 */ }
  }
  // 解析有效会话：主会话可能已过期（重启后 session id 变），主失败则遍历 alternatives
  async function resolveSession(loc: any): Promise<string | null> {
    if (!loc || !loc.bound) return null
    const candidates = [loc.sessionId, ...((loc.alternatives || []).map((a: any) => a.sessionId))].filter(Boolean)
    const hasSQ = !!(ctx as any).sessionQuery
    for (const sid of candidates) {
      try {
        const s = await (ctx as any).sessionQuery?.readSession?.(sid)
        if (s) return sid
        console.log(`[dsh-phone] readSession 返回空: sid=${sid.slice(0, 12)} hasSessionQuery=${hasSQ}`)
      } catch (e) {
        console.log(`[dsh-phone] readSession 异常: sid=${sid.slice(0, 12)} err=${String(e).slice(0, 80)}`)
      }
    }
    return null
  }
  // 群消息是否 @ 自己（短名 / 昵称 / 名下号码）
  function isMentionedMe(text: string): boolean {
    if (!text) return false
    if (text.includes(`@${AGENT_SHORT}`)) return true
    if (ownNickname && text.includes(`@${ownNickname}`)) return true
    // @号码：群成员常按号码存（@951230006 等），号码即本 agent 身份 → 也触发
    for (const m of text.matchAll(/@([\w\u4e00-\u9fa5.-]+)/g)) {
      const nn = normNum(m[1])
      if (nn && ownNumbers.includes(nn)) return true
    }
    return false
  }
  // 注入会话（session.prompt RPC，loopback 信任通过）：触发 AI 生成回复
  async function promptSession(sid: string, promptText: string): Promise<boolean> {
    try {
      const port = (ctx as any).webServer?.port || 8099
      const body = {
        type: 'client-request',
        rpcId: `dsh-phone-${Date.now().toString(36)}`,
        method: 'session.prompt',
        payload: { sessionId: sid, content: [{ type: 'text', text: promptText }], mode: 'queue' },
      }
      const r = await fetch(`http://127.0.0.1:${port}/api/session.prompt`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      }).catch(() => null)
      if (!r) return false
      const d = await r.json().catch(() => null)
      return !!(d && d.result && d.result.ok)
    } catch { return false }
  }
  async function pollInbox(): Promise<void> {
    try {
      const loc = await (await fetch(`${PHONE_BASE}/api/v1/agent/locate?did=${encodeURIComponent(AGENT_DID)}`, {
        headers: { Accept: 'application/json' },
      })).json()
      if (!loc || !loc.bound) return   // 无绑定会话则无法注入
      const sid = await resolveSession(loc)
      if (!sid) return   // 主+alternatives 均失效
      const base = lastChecked[INBOX_KEY] || 0
      const d = await (await fetch(`${RCS_BASE}/api/v1/phone/messages?did=${encodeURIComponent(AGENT_DID)}&since=${base}`, {
        headers: { Accept: 'application/json' }, cache: 'no-store',
      })).json()
      const msgs = (d.messages || []) as any[]
      let injected = 0
      for (const m of msgs) {
        if (m.signal) continue                          // 语音信令走前端
        if (m.from === AGENT_DID) continue              // 自己发出的（本实例前端已注入快路径，防重复）
        if ((m.seq || 0) <= base) continue
        const text = String(m.text || '')
        if (!text.trim()) continue
        if (m.groupId) {
          // 群消息：只处理 @ 自己的（被点名才回复，防刷屏）
          if (!isMentionedMe(text)) continue
        }
        // 构造 srcTag（来源即目的地）+ prompt（自由回答，与前端投递同模板）
        const fromNumber = String(m.fromNumber || '')
        const srcTag = m.groupId
          ? `<dsh-phone>{"source":"group","fromNumber":"${fromNumber}","conversationId":"${m.conversationId || ''}","groupId":"${m.groupId}"}</dsh-phone>`
          : `<dsh-phone>{"source":"sms","fromNumber":"${fromNumber}"}</dsh-phone>`
        // v2 文本附件：kind=text 时拉取全文注入 prompt（长内容 → LLM 上下文对齐）
        let bodyText = text
        if (m.attachment && m.attachment.kind === 'text' && m.attachment.fileId) {
          const full = await fetch(`${RCS_BASE}/api/v1/phone/attachment/${m.attachment.fileId}`, { headers: { Accept: 'application/octet-stream' } })
            .then((r) => r.ok ? r.text() : '').catch(() => '')
          if (full) {
            const MAX_INJECT = 50000   // 单次注入上限（防超长附件占满上下文）
            const shown = full.length > MAX_INJECT ? full.slice(0, MAX_INJECT) + '\n...(附件已截断)' : full
            bodyText = `[文本附件 ${m.attachment.name || 'file'}（${full.length} 字符）]\n${shown}`
          } else {
            bodyText = `[文本附件 ${m.attachment.name || 'file'} 拉取失败，仅引用]\n${text}`
          }
        }
        const selfIntro = ownNickname ? `[身份] 你是「${ownNickname}」（数字员工），不要自称 dshlib 或其他名字。` : ''
        const prompt = m.groupId
          ? `${srcTag} ${selfIntro} [群聊消息] ${fromNumber} 在群里发来消息，请直接回复（回复会原样发回群里）。消息：${bodyText}`
          : `${srcTag} ${selfIntro} [电话短信] 号码 ${fromNumber} 发来短信，请直接回复（你的回复会原样回给该号码）。短信内容：${bodyText}`
        const ok = await promptSession(sid, prompt)
        if (ok) injected++
        // 无论注入成败都推进游标（避免死循环重试同一条）
        lastChecked[INBOX_KEY] = Math.max(lastChecked[INBOX_KEY] || 0, m.seq || 0)
      }
      saveCursor(lastChecked)
      if (injected > 0) console.log(`[dsh-phone] inbox: 注入 ${injected} 条（sid=${sid.slice(0, 8)}）`)
    } catch (e) { console.log('[dsh-phone] inbox err:', String(e).slice(0, 120)) }
  }

  const timer = setInterval(() => { pollAgentReplies(); pollInbox() }, REPLY_INTERVAL)
  setTimeout(() => { pollAgentReplies(); pollInbox(); refreshNickname() }, 5000)   // 首轮延迟（等绑定建立）
  ctx.on('dispose', () => clearInterval(timer))
}

function extractText(m: any): string {
  const c = m?.content
  if (typeof c === 'string') return c.trim()
  if (Array.isArray(c)) {
    // DSH assistant 消息 content 是块数组（reasoning + text）；只取 text 块，跳过 reasoning（否则拼入思考过程触发过滤误杀）
    return c
      .filter((x: any) => typeof x === 'string' || (x && x.type !== 'reasoning'))
      .map((x: any) => (typeof x === 'string' ? x : x?.text || ''))
      .join(' ').trim()
  }
  if (c && typeof c === 'object') return String(c.text || '')
  return ''
}
