/**
 * dsh-phone node half — Loader 挂载入口。
 * client 插件的运行时职责（浮窗 UI）在 client 半（src/client/index.tsx）；
 * node 半提供挂载标识 + Agent 回复转回（读绑定会话最新消息 → 按来源路由回电话）。
 *
 * 路由原则（来源即目的地）：投递时 client 半在 user 消息带 <dsh-phone>{"source","fromNumber","conversationId"}</dsh-phone>
 * 来源标记；node 半解析最近一个来源标记，把后续 assistant 回复按来源路由回去。
 */
import type { Context } from '@deepseek-ai/cordis'

export const name = 'dsh-phone'
export const inject = ['sessionQuery']

const PHONE_BASE = 'https://compliancehub.cn'
const AGENT_DID = 'did:cha2a:agent:dshlib'
const REPLY_INTERVAL = 8000          // 轮询间隔
const SEEN_MAX = 200                 // 已处理消息去重上限

export function apply(ctx: Context): void {

  // ── Agent 回复转回：读绑定会话最新 assistant 消息 → 按来源路由回电话 ──
  const seen = new Set<string>()
  let lastChecked: Record<string, number> = {}

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
      if (!loc || !loc.bound || !loc.sessionId) return
      const sid = loc.sessionId

      // 2. 读会话消息序列（含 user 来源标记 + assistant 回复）
      const session = await (ctx as any).sessionQuery?.readSession?.(sid)
      if (!session) return
      const events = (session as any).events || []
      const msgs = extractMessages(events)


      const seenCount = lastChecked[sid] || 0

      // 3. 追踪最近来源标记：遍历消息，记住每个 user 标记；assistant 回复按最近标记路由
      let currentSource: { source: string; fromNumber: string; groupId?: string; conversationId?: string } | null = null
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
        if (text.length < 4 || text.length > 2000) continue
        // 过滤思考过程/转述
        if (/^[\[（(]?think/i.test(text) || /转述|relay|simulated|appears to be|let me think|I'll|I will/i.test(text)) continue
        const key = sid + ':' + i + ':' + text.slice(0, 50)
        if (seen.has(key)) continue
        seen.add(key)
        if (seen.size > SEEN_MAX) seen.delete(seen.values().next().value)

        // 路由：默认回短信（来源 sms）；replyChannel 配置在此扩展（现在默认 auto = 跟随来源）
        const src = currentSource || { source: 'sms', fromNumber: '+86 95123 0001' }

        if (src.source === 'sms') {
          // 回短信：agent 侧号码 0002 → 原发信号码（to 规范化 E.164 无空格）
          const toNum = src.fromNumber.replace(/[^0-9+]/g, '')
          fetch(`${PHONE_BASE}/api/v1/phone/message`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ from: AGENT_DID, fromNumber: '+86 95123 0002', to: toNum, text: `[agent回复] ${text}` }),
          }).catch(() => {})
        } else if (src.source === 'group' && src.groupId) {
          // 回群广播（来源=group）：agent 回复广播回群；带 conversationId 保持群级会话语义
          fetch(`${PHONE_BASE}/api/v1/phone/group/message`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ from: AGENT_DID, fromNumber: '+86 95123 0002', groupId: src.groupId, ...(src.conversationId ? { conversationId: src.conversationId } : {}), text: `[agent回复] ${text}` }),
          }).catch(() => {})
        }
      }
      lastChecked[sid] = msgs.length
    } catch { /* 静默，下轮重试 */ }
  }

  const timer = setInterval(pollAgentReplies, REPLY_INTERVAL)
  setTimeout(pollAgentReplies, 5000)   // 首轮延迟（等绑定建立）
  ctx.on('dispose', () => clearInterval(timer))
}

function extractText(m: any): string {
  const c = m?.content
  if (typeof c === 'string') return c.trim()
  if (Array.isArray(c)) {
    return c.map((x: any) => (typeof x === 'string' ? x : x?.text || '')).join(' ').trim()
  }
  if (c && typeof c === 'object') return String(c.text || '')
  return ''
}
