import { test } from 'node:test'
import assert from 'node:assert/strict'
import { canonicalJson } from '../src/canonical-json.ts'
import { signPayload, verifyPayload } from '../src/sign.ts'
import { generateKeyPairSync } from 'node:crypto'

// P1-6：canonicalJson 确定性测试（防"三处实现漂移致跨端验签不一致"）
// 语义：sorted keys + 紧凑 JSON（与 cha2a-registry 服务端验签约定一致，非完整 JCS——见模块注释）

test('确定性：同对象两次序列化字节一致', () => {
  const o = { z: 1, a: { c: [3, 2, 1], b: 'x' }, m: null }
  assert.equal(canonicalJson(o), canonicalJson(o))
})

test('key 排序（顶层 + 嵌套）', () => {
  assert.equal(canonicalJson({ b: 1, a: 2 }), '{"a":2,"b":1}')
  assert.equal(canonicalJson({ x: { d: 4, c: 3 }, y: 1 }), '{"x":{"c":3,"d":4},"y":1}')
})

test('数组保序（不排序）', () => {
  assert.equal(canonicalJson({ a: [3, 1, 2] }), '{"a":[3,1,2]}')
})

test('原始值 / null / 空', () => {
  assert.equal(canonicalJson('s'), '"s"')
  assert.equal(canonicalJson(42), '42')
  assert.equal(canonicalJson(null), 'null')
  assert.equal(canonicalJson({}), '{}')
  assert.equal(canonicalJson([]), '[]')
})

test('紧凑（无空格）', () => {
  const out = canonicalJson({ a: 1, b: [1, 2] })
  assert.ok(!out.includes(' '), `不应含空格: ${out}`)
})

test('中文/非 ASCII 值：JSON.stringify 语义（两端一致即可）', () => {
  const out = canonicalJson({ name: '张三' })
  assert.equal(out, '{"name":"张三"}')  // UTF-8 原样（与 JSON.stringify 一致）
})

test('签名往返：signPayload → verifyPayload 通过', () => {
  const { privateKey: pk, publicKey: pub } = generateKeyPairSync('ed25519')
  // signPayload/verifyPayload 约定：pkcs8/spki DER base64（见 sign.ts）
  const privateKey = (pk.export({ type: 'pkcs8', format: 'der' }) as Buffer).toString('base64')
  const publicKey = (pub.export({ type: 'spki', format: 'der' }) as Buffer).toString('base64')
  const payload = { amountCents: 1500, outTradeNo: 'T20260902', action: 'recharge-qr', ts: 123 }
  const sig = signPayload(payload, privateKey)
  assert.ok(sig)
  assert.equal(verifyPayload(payload, sig, publicKey), true)
  // 篡改必失败
  assert.equal(verifyPayload({ ...payload, amountCents: 9999 }, sig, publicKey), false)
})

test('canonicalJson 稳定性向量（服务端约定对齐锚点）', () => {
  // 若服务端验签实现漂移，此向量是跨端一致性的哨兵
  assert.equal(canonicalJson({ a: 1, b: 'x', c: [true, null, { d: 2 }] }),
    '{"a":1,"b":"x","c":[true,null,{"d":2}]}')
})
