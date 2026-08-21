/**
 * dsh-phone API 层：cha2a registry 的 REST 统一封装
 * - 所有 fetch 集中于此，统一超时/错误归一/JSON 解析
 * - 各 App / PhoneOverlay 通过 api.* 访问，不再散落 fetch
 */
import { PHONE_BASE, AGENT_DID } from './config'

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message) }
}

const TIMEOUT = 12000

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT)
  try {
    const r = await fetch(`${PHONE_BASE}${path}`, { ...init, signal: ctrl.signal, headers: { Accept: 'application/json', ...(init?.headers || {}) } })
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
  /** 消耗积分（解锁主题等） */
  consumeCredits: (amount: number, reason: string) =>
    req<{ ok?: boolean; error?: string }>('/api/v1/phone/credits/consume', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ did: AGENT_DID, amount, reason }),
    }),

  // ── 消息中继（短信/附件）──
  /** 发送短信 */
  sendMessage: (fromNumber: string, to: string, text?: string, attachment?: { fileId?: string; name?: string; size?: number; hash?: string }) =>
    req<any>('/api/v1/phone/message', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: AGENT_DID, fromNumber, to, text, attachment }),
    }),
  /** 增量拉取收件箱（seq 游标） */
  messages: (since = 0) => req<{ messages?: Array<any> }>(`/api/v1/phone/messages?did=${encodeURIComponent(AGENT_DID)}&since=${since}`),
  /** 上传附件（base64）→ fileId */
  uploadAttachment: (name: string, mime: string, dataB64: string) =>
    req<{ ok?: boolean; fileId?: string; hash?: string }>('/api/v1/phone/attachment', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ did: AGENT_DID, name, mime, data: dataB64 }),
    }),

  // ── RCS 群 ──
  groupList: (did = AGENT_DID) => req<{ groups?: Array<{ groupId: string; name: string; memberCount: number }> }>(`/api/v1/phone/group/list?did=${encodeURIComponent(did)}`),
  groupCreate: (name: string, members: string[]) =>
    req<{ ok?: boolean; groupId?: string }>('/api/v1/phone/group', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, creator: AGENT_DID, members }),
    }),
  groupDetail: (groupId: string) => req<{ ok?: boolean; groupId: string; name: string; members?: string[]; conversationId?: string }>(`/api/v1/phone/group/${groupId}`),
  groupMembersDetail: (groupId: string) => req<{ ok?: boolean; groupId: string; members?: Array<{ member: string; nickname: string; type: 'phone' | 'agent'; level: number }> }>(`/api/v1/phone/group/${groupId}/members-detail`),
  groupMessage: (fromNumber: string, groupId: string, text: string) =>
    req<any>('/api/v1/phone/group/message', {
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
