/**
 * dsh-phone agent profile 导入脚本（引导层）
 *
 * agent profile = 跟着 agent 的 RCS 业务档案（展示名 / 能力 / 将来的好友等），存在 rcs-server。
 * 这是「属性」（config/state）和「动作」（sendGroup/sendSms 等）之外的第三层：
 * 每次刷新拉一次 profile，装进 client 运行时；切 agent 即换一份，零痕迹（微信模型）。
 *
 * 分层：registry（HSS）只管身份/号码/信任；RCS 业务档案在 rcs-server（AS）。
 * 本脚本只消费 rcs-server 的 profile，不碰 registry 的身份数据。
 */
import { RCS_BASE } from './config'

export interface AgentProfile {
  did: string
  displayName: string | null
  capabilities: string[]
}

/** 从 rcs-server 拉 agent profile；无记录返回 null（调用方回退 registry 注册名） */
export async function loadAgentProfile(did: string): Promise<AgentProfile | null> {
  if (!did) return null
  try {
    const r = await fetch(`${RCS_BASE}/api/v1/agent/profile?did=${encodeURIComponent(did)}`, { headers: { Accept: 'application/json' } })
    if (!r.ok) return null
    const d = await r.json()
    if (d && d.ok && d.profile) return d.profile as AgentProfile
    return null
  } catch {
    return null
  }
}
