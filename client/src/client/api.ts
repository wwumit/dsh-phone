/**
 * dsh-phone API 层：cha2a registry 的 REST 统一封装
 * - 所有 fetch 集中于此，统一超时/错误归一/JSON 解析
 * - 各 App / PhoneOverlay 通过 api.* 访问，不再散落 fetch
 */
import { PHONE_BASE, RCS_BASE, AGENT_DID } from './config'

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message) }
}

const TIMEOUT = 12000

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  return reqBase<T>(PHONE_BASE, path, init)
}

// RCS 业务端点（消息/群/附件）走 rcs-server
async function reqRcs<T>(path: string, init?: RequestInit): Promise<T> {
  return reqBase<T>(RCS_BASE, path, init)
}

async function reqBase<T>(base: string, path: string, init?: RequestInit): Promise<T> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT)
  try {
    const r = await fetch(`${base}${path}`, { ...init, signal: ctrl.signal, headers: { Accept: 'application/json', ...(init?.headers || {}) }, cache: 'no-store' })
    if (!r.ok) {
      let msg = `HTTP ${r.status}`
      try { const d = await r.json(); if (d?.error) msg = d.error } catch {}
      throw new ApiError(r.status, msg)
    }
    return await r.json() as T
  } catch (e) {
    if (e instanceof ApiError) throw e
    throw new ApiError(0, e instanceof Error ? e.message : '网络错误')
  } finally {
    clearTimeout(timer)
  }
}

// ── 号码簿 / 开户 ──
export const api = {
  /** 号码 → agent（呼叫寻址 + 信任摘要） */
  resolve: (number: string) => req<any>(`/api/v1/phone/resolve?number=${encodeURIComponent(number)}`),
  /** DID → 号码簿（本机号码列表） */
  lookup: (did = AGENT_DID) => req<{ numbers?: string[] }>(`/api/v1/phone/lookup?did=${encodeURIComponent(did)}`),
  /** 公共号码簿 */
  directory: () => req<{ numbers?: Array<{ number: string; agentDid: string; displayName: string | null; level: number }> }>('/api/v1/phone/directory'),
  /** 开户申请 */
  apply: (displayName: string, consent = true) =>
    req<{ number?: string; welcomeCredits?: number; error?: string }>('/api/v1/phone/apply', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentDid: AGENT_DID, displayName, consent }),
    }),
  /** 积分余额 */
  credits: (did = AGENT_DID) => req<{ credits?: number }>(`/api/v1/phone/credits?did=${encodeURIComponent(did)}`),

  // ── 充值（X402 微信支付；金额由服务端定价表决定，客户端只传套餐）──
  /** 充值下单：返回微信 Native 收款码链接（code_url，需渲染成二维码） */
  purchase: (pack: 'yuan1' | 'starter' | 'standard') =>
    req<{ ok?: boolean; out_trade_no?: string; code_url?: string; amount_cents?: number; credits?: number; base?: number; bonus?: number; error?: string }>('/api/v1/phone/credits/purchase', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ did: AGENT_DID, pack }),
    }),
  /** 确认支付并入账（幂等）：status SUCCESS=已到账 / PENDING=未支付，轮询调用 */
  confirmPayment: (outTradeNo: string) =>
    req<{ ok?: boolean; status?: string; credited?: boolean; balance?: number; message?: string; error?: string }>('/api/v1/phone/credits/confirm', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ did: AGENT_DID, out_trade_no: outTradeNo }),
    }),
  /** 账单流水（最近 50 条） */
  ledger: (did = AGENT_DID) => req<{ entries?: Array<{ did: string; type: string; amount: number; reason: string; at: string }> }>(`/api/v1/phone/credits/ledger?did=${encodeURIComponent(did)}`),

  // ── 消息中继（短信/附件）──
  /** 发送短信 */
  sendMessage: (fromNumber: string, to: string, text?: string, attachment?: { fileId?: string; name?: string; size?: number; hash?: string }, payload?: Record<string, unknown>) =>
    reqRcs<any>('/api/v1/phone/message', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: AGENT_DID, fromNumber, to, text, attachment, ...(payload ? { payload } : {}) }),
    }),
  /** 增量拉取收件箱（seq 游标） */
  messages: (since = 0) => reqRcs<{ messages?: Array<any> }>(`/api/v1/phone/messages?did=${encodeURIComponent(AGENT_DID)}&since=${since}`),
  /** 上传附件（base64）→ fileId */
  uploadAttachment: (name: string, mime: string, dataB64: string) =>
    reqRcs<{ ok?: boolean; fileId?: string; hash?: string; size?: number }>('/api/v1/phone/attachment', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ did: AGENT_DID, name, mime, data: dataB64 }),
    }),

  // ── RCS 群 ──
  groupList: (did = AGENT_DID) => reqRcs<{ groups?: Array<{ groupId: string; name: string; memberCount: number }> }>(`/api/v1/phone/group/list?did=${encodeURIComponent(did)}`),
  groupCreate: (name: string, members: string[]) =>
    reqRcs<{ ok?: boolean; groupId?: string }>('/api/v1/phone/group', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, creator: AGENT_DID, members }),
    }),
  groupDetail: (groupId: string) => reqRcs<{ ok?: boolean; groupId: string; name: string; members?: string[]; conversationId?: string }>(`/api/v1/phone/group/${groupId}`),
  groupMembersDetail: (groupId: string) => reqRcs<{ ok?: boolean; groupId: string; members?: Array<{ member: string; nickname: string; type: 'phone' | 'agent'; level: number }> }>(`/api/v1/phone/group/${groupId}/members-detail`),
  groupMessage: (fromNumber: string, groupId: string, text: string) =>
    reqRcs<any>('/api/v1/phone/group/message', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: AGENT_DID, fromNumber, groupId, text }),
    }),

  // ── 用量 ──
  usage: (did = AGENT_DID) => req<{ usage?: any }>(`/api/v1/phone/usage?did=${encodeURIComponent(did)}`),
  reportUsage: (type: string, amount: number) =>
    req<any>('/api/v1/phone/usage', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ did: AGENT_DID, type, amount }),
    }),

  // ── agent 会话（凭证 + 绑定）──
  sessionToken: (issuedBy: string, ttlSeconds = 3600) =>
    req<{ ok?: boolean; token?: string; expiresAt?: string }>('/api/v1/agent/session-token', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentDid: AGENT_DID, issuedBy, ttlSeconds }),
    }),
  sessionBind: (body: Record<string, unknown>) =>
    req<any>('/api/v1/agent/session-bind', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  locate: (did = AGENT_DID) => req<{ bound?: boolean; sessionId?: string }>(`/api/v1/agent/locate?did=${encodeURIComponent(did)}`),
}
