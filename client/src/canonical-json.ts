/**
 * 稳定 JSON 序列化（canonicalJson 单一实现——P1-6 修复）
 *
 * 语义：sorted keys + 紧凑 JSON（无空格）。注意这不是完整 RFC 8785 JCS
 * （JCS 另有数字序列化规则与 Unicode 规范化），本实现与 cha2a-registry
 * 服务端验签端点的规范化**约定一致**（两端同语义才能跨端验签）。
 * 跨端一致性由 conformance outbound-sig 向量 + 本模块测试共同约束。
 *
 * 纯函数、零依赖：node 半（sign.ts）与浏览器半（webcrypto.ts）共享同一实现，
 * 消除此前两份逐字重复的漂移风险。
 */

/** 稳定 JSON 序列化：keys 排序 + 紧凑（对齐验签端的规范化） */
export function canonicalJson(obj: unknown): string {
  return stableStringify(obj)
}

function stableStringify(obj: unknown): string {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj)
  if (Array.isArray(obj)) return '[' + obj.map(stableStringify).join(',') + ']'
  const keys = Object.keys(obj as Record<string, unknown>).sort()
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + stableStringify((obj as Record<string, unknown>)[k])).join(',') + '}'
}
