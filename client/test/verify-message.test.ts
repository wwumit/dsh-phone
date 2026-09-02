import { test } from 'node:test'
import assert from 'node:assert/strict'
import { verifyTarget } from '../src/client/verify-message.ts'

// P1-5：验签对象判定（两端约定：结构化验 payload 除 signature；纯文本验 {text}）
test('无 signature → null（无需验）', () => {
  assert.equal(verifyTarget(undefined, 'hi'), null)
  assert.equal(verifyTarget({ action: 'x' }, 'hi'), null)  // 无 signature
  assert.equal(verifyTarget({ signature: 123 }, 'hi'), null)  // signature 非 string
})

test('结构化 payload（业务字段 + signature）→ 验 payload 除 signature', () => {
  const t = verifyTarget({ action: 'recharge-qr', outTradeNo: 'T1', signature: 'sig' }, '码')
  assert.ok(t && t.structured)
  assert.deepEqual(t.target, { action: 'recharge-qr', outTradeNo: 'T1' })
})

test('纯文本（payload 仅 signature）→ 验 {text}', () => {
  const t = verifyTarget({ signature: 'sig' }, '你好，世界')
  assert.ok(t && !t.structured)
  assert.deepEqual(t.target, { text: '你好，世界' })
})

test('纯文本但无 text 字段 → null（无法判定对象）', () => {
  assert.equal(verifyTarget({ signature: 'sig' }, undefined), null)
})
