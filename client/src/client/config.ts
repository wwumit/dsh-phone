/**
 * dsh-phone client 半统一配置（浏览器端）
 *
 * 配置运行时化：身份 / 线路号 / 端点由 node 半在运行时经 webServer.tapIndex
 * 注入 window.__DSH_PHONE_CONFIG__（见 src/index.ts buildPhoneConfig），
 * client 半启动时读这个全局——浏览器没有 process.env，构建时也不再烙身份。
 * 这样 client.js 一份通用、干净，不再按环境（dshlib/wwu-mac/volcano）各建一份。
 * 注入缺失（异常场景）时回退到演示缺省值，保证插件仍可加载。
 */

// node 半注入的运行时配置形状（与 src/index.ts PhoneRuntimeConfig 对齐）
interface PhoneRuntimeConfig {
  registryBase: string
  rcsBase: string
  agentDid: string
  signPort?: number
  numA: string
  numB: string
}

function runtimeConfig(): Partial<PhoneRuntimeConfig> {
  try {
    const w = (typeof window !== 'undefined' ? window : {}) as { __DSH_PHONE_CONFIG__?: Partial<PhoneRuntimeConfig> }
    return w.__DSH_PHONE_CONFIG__ || {}
  } catch {
    return {}
  }
}
const INJ = runtimeConfig()

// registry（HSS/HLR）：身份/号码/信任/解析；RCS（AS）：消息/群/附件
// 注入缺失时为空（不烙任何演示身份），身份守卫据此判"未配置"，不会静默落到别人的身份
export const PHONE_BASE = INJ.registryBase || 'https://compliancehub.cn'
export const RCS_BASE = INJ.rcsBase || PHONE_BASE + '/rcs'
export const AGENT_DID = INJ.agentDid || ''

// Owner 终端身份（2.0）：owner 也注册独立 DID（did:cha2a:user:<agent短名>-owner），
// 开户 App 注册后才能发言；未注册时 B 面板以纯号码身份发言（号码在簿即可）
export const OWNER_DID = AGENT_DID.startsWith('did:cha2a:agent:')
  ? `did:cha2a:user:${AGENT_DID.replace(/^did:cha2a:agent:/, '')}-owner`
  : ''

// 终端缺省显示名（通用占位；实际显示名 = registry 注册名 / RCS profile，见 index.tsx loadNames）
export const AGENT_LABEL = 'Agent'
export const OWNER_LABEL = 'Owner'
export const STORE_URL = 'https://compliancehub.cn/store/'

// 双面板线路号（同页两部电话演示）；由 node 半注入，注入缺失时为空（未配置）
export const MINE_NUM = {
  A: INJ.numA || '',
  B: INJ.numB || '',
} as Record<'A' | 'B', string>
export const PEER_NUM = { A: MINE_NUM.B, B: MINE_NUM.A } as Record<'A' | 'B', string>
export const NUM_A = MINE_NUM.A.replace(/[^0-9+]/g, '')
export const NUM_B = MINE_NUM.B.replace(/[^0-9+]/g, '')

// 本机签名服务端口（node 半提供；跨 agent 场景签订单 payload 用）
export const SIGN_PORT = typeof INJ.signPort === 'number' ? INJ.signPort : 8098

// 本地存储 key（设备态）——按 agent DID 命名空间化：设备通用、切号零痕迹（微信模型）。
// 键名含 DID（含冒号，localStorage 键名允许）；node 半文件名需另做安全化（见 src/index.ts）。
export function agentKey(suffix: string): string {
  return AGENT_DID ? `dsh-phone:${AGENT_DID}:${suffix}` : `dsh-phone:${suffix}`
}
export const THEME_KEY = agentKey('theme')
export const UNLOCKED_KEY = agentKey('unlocked')
export const NOTE_KEY = agentKey('note')
// v2：浮标改为胶囊形显示名字后，旧 pos（52px 圆钮时代）不再贴合，升级重置一次
export const POS_KEY = agentKey('pos-v2')
