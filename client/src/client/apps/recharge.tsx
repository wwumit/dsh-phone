/**
 * RechargeApp — 额度充值（X402 微信支付：扫码 → 轮询确认 → 入账）
 *
 * 金额由服务端定价表决定（客户端只传 pack，防篡改）：
 *   starter  ¥10   = 2000 + 赠 200 = 2200 额度
 *   standard ¥100  = 20000 + 赠 3000 = 23000 额度
 * 1 条消息 = 1 额度（¥0.005/条）。
 *
 * 支付模式：真实微信 Native 扫码。simulate 需管理员（服务端鉴权），客户端不触碰。
 */
import React, { useEffect, useRef, useState } from 'react'
import { type AppProps } from '../apps'
import { AppBar } from '../theme'
import { api } from '../api'
import { SIGN_PORT, NUM_A, NUM_B } from '../config'
import qrcode from 'qrcode-generator'

const PACKS = [
  { id: 'yuan1' as const, price: '¥1', credits: 200, desc: '200 条（标准汇率）' },
  { id: 'starter' as const, price: '¥10', credits: 2200, desc: '2000 条 + 赠 200 条' },
  { id: 'standard' as const, price: '¥100', credits: 23000, desc: '20000 条 + 赠 3000 条' },
]
const POLL_MS = 3000
const POLL_MAX = 60   // 3 分钟自动停（微信 Native 码有效期长），留手动确认按钮

type Step = 'idle' | 'ordering' | 'paying' | 'done'

export function RechargeApp(p: AppProps): JSX.Element {
  const { t, back } = p
  const [balance, setBalance] = useState<number | null>(null)
  const [step, setStep] = useState<Step>('idle')
  const [order, setOrder] = useState<{ outTradeNo: string; credits: number; cents: number; codeUrl?: string } | null>(null)
  const [qrUrl, setQrUrl] = useState('')
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  function refreshBalance(): void {
    api.credits().then((d) => setBalance(typeof d.credits === 'number' ? d.credits : null)).catch(() => setBalance(null))
  }
  useEffect(() => {
    refreshBalance()
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [])

  function stopPoll(): void { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null } }

  function startPoll(outTradeNo: string): void {
    let n = 0
    stopPoll()
    timerRef.current = setInterval(async () => {
      n++
      try {
        const d = await api.confirmPayment(outTradeNo)
        if (d.credited) {
          stopPoll()
          setMsg(`✅ 充值成功，已到账 ${typeof d.balance === 'number' ? d.balance.toLocaleString() : ''} 额度`)
          setStep('done')
          refreshBalance()
          return
        }
        if (d.status === 'ROLLED_BACK') { stopPoll(); setErr('订单异常（已回滚），请联系管理员'); setStep('idle'); return }
      } catch { /* 网络抖动，继续轮询 */ }
      if (n >= POLL_MAX) { stopPoll(); setErr('支付确认超时：若已扫码付款，请点下方「我已支付」手动确认') }
    }, POLL_MS)
  }

  async function buy(packId: 'yuan1' | 'starter' | 'standard'): Promise<void> {
    setErr(''); setMsg(''); setStep('ordering')
    try {
      const d = await api.purchase(packId)
      if (!d.ok || !d.out_trade_no || !d.code_url) { setErr(d.error || '下单失败'); setStep('idle'); return }
      const qr = qrcode(0, 'M')
      qr.addData(d.code_url)
      qr.make()
      setQrUrl(qr.createDataURL(4, 8))
      setOrder({ outTradeNo: d.out_trade_no, credits: d.credits || 0, cents: d.amount_cents || 0, codeUrl: d.code_url || '' })
      setStep('paying')
      startPoll(d.out_trade_no)
    } catch (e: any) {
      setErr(e?.message || '下单失败（支付服务不可用）')
      setStep('idle')
    }
  }

  function manualConfirm(): void {
    if (!order) return
    setErr('')
    api.confirmPayment(order.outTradeNo).then((d) => {
      if (d.credited) { setMsg(`✅ 充值成功，已到账 ${typeof d.balance === 'number' ? d.balance.toLocaleString() : ''} 额度`); setStep('done'); refreshBalance() }
      else setErr(d.message || '仍未检测到支付，请确认已扫码付款')
    }).catch(() => setErr('确认失败，请重试'))
  }

  // 跨 agent 演示：把本机充值二维码作为图片附件发给对端（A/B 面板或群），
  // 对方收到后呈现，主人扫码 → 本机 confirm 轮询 → 积分到账
  function sendQr(): void {
    if (!qrUrl || !order) return
    setErr(''); setMsg('')
    ;(async () => {
      try {
        // 1. 上传二维码图片，拿服务端 SHA-256 hash（签名绑定的图片内容标识）
        const b64 = qrUrl.split(',')[1]
        const up = await api.uploadAttachment('recharge-qr.png', 'image/png', b64)
        if (!up.ok || !up.fileId || !up.hash) { setErr('附件上传失败，无法生成防替换签名'); return }
        // 2. 构造订单级 payload 并请求签名（node 半私钥，浏览器不接触私钥）
        const payload = {
          action: 'recharge-qr',
          outTradeNo: order.outTradeNo,
          amountCents: order.cents,
          codeUrl: order.codeUrl || '',
          attachmentHash: up.hash,
          ts: Date.now(),
        }
        const signResp = await fetch(`http://127.0.0.1:${SIGN_PORT}/sign`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ payload }),
        })
        const signData = await signResp.json().catch(() => null)
        if (!signData?.ok || !signData.signature) { setErr('签名服务不可用（node 半签名服务未启动？）'); return }
        // 3. 发送（attachment + payload 携带签名）
        const fromNum = p.id === 'A' ? NUM_A : NUM_B
        await api.sendMessage(
          fromNum,
          p.data.otherNumber,
          `【收款码·已签名】扫码支付 ¥${(order.cents / 100).toFixed(2)} → ${order.credits} 额度（订单 ${order.outTradeNo}）`,
          { fileId: up.fileId, name: 'recharge-qr.png', size: up.size || 0, hash: up.hash },
          { ...payload, signature: signData.signature },
        )
        setMsg(`✅ 已签名收款码发送给 ${p.data.otherNumber}（附件 SHA-256 + 订单签名，防替换）`)
      } catch (e: any) { setErr(`发送失败：${e?.message || '未知错误'}`) }
    })()
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <AppBar title="额度充值" onBack={back} theme={t} />
      <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
        <div style={{ background: t.card, border: '1px solid #2c2c2e', borderRadius: 12, padding: '10px 12px', marginBottom: 8 }}>
          <div style={{ fontSize: 12, color: t.sub }}>当前余额</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: t.warn, marginTop: 2 }}>🪙 {balance === null ? '…' : balance.toLocaleString()} 额度</div>
          <div style={{ fontSize: 10, color: t.muted, marginTop: 2 }}>1 条消息 = 1 额度（¥0.005/条）</div>
        </div>
        <div style={{ fontSize: 12, color: t.sub, marginBottom: 6 }}>选择充值套餐（微信扫码支付，金额由服务端定价）</div>
        {PACKS.map((pk) => (
          <button key={pk.id} disabled={step === 'ordering' || step === 'paying'} onClick={() => buy(pk.id)}
            style={{ display: 'block', width: '100%', textAlign: 'left', background: t.key, border: '1px solid #2c2c2e', borderRadius: 12, padding: 12, marginBottom: 8, cursor: 'pointer', opacity: (step === 'ordering' || step === 'paying') ? 0.5 : 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ color: '#fff', fontSize: 15, fontWeight: 600 }}>{pk.price}</span>
              <span style={{ color: t.accent, fontSize: 12 }}>{pk.credits} 额度</span>
            </div>
            <div style={{ color: t.sub, fontSize: 11, marginTop: 2 }}>{pk.desc}</div>
          </button>
        ))}
        {step === 'paying' && order && (
          <div style={{ background: t.card, border: '1px solid #2c2c2e', borderRadius: 12, padding: 14, marginTop: 4, textAlign: 'center' }}>
            <div style={{ fontSize: 13, color: '#fff', marginBottom: 8 }}>微信扫码支付 ¥{(order.cents / 100).toFixed(2)} · {order.credits} 额度</div>
            {qrUrl && <img src={qrUrl} alt="微信收款码" style={{ width: 168, height: 168, borderRadius: 8, display: 'block', margin: '0 auto' }} />}
            <div style={{ fontSize: 10, color: t.muted, marginTop: 8 }}>支付成功后自动到账；超时可用下方按钮手动确认</div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 8 }}>
              <button onClick={sendQr} style={{ padding: '7px 14px', borderRadius: 999, background: t.ok, color: '#fff', border: 0, fontSize: 12, cursor: 'pointer' }}>📤 发二维码给对端</button>
              <button onClick={manualConfirm} style={{ padding: '7px 16px', borderRadius: 999, background: t.accent, color: '#fff', border: 0, fontSize: 12, cursor: 'pointer' }}>我已支付</button>
            </div>
          </div>
        )}
        {step === 'ordering' && <div style={{ textAlign: 'center', color: t.sub, fontSize: 12, padding: 10 }}>正在下单…</div>}
        {msg && <div style={{ background: 'rgba(48,209,88,.12)', border: '1px solid rgba(48,209,88,.4)', borderRadius: 10, padding: '8px 10px', fontSize: 12, color: t.ok, marginTop: 6 }}>{msg}</div>}
        {err && <div style={{ background: 'rgba(255,59,48,.12)', border: '1px solid rgba(255,59,48,.4)', borderRadius: 10, padding: '8px 10px', fontSize: 12, color: '#ff453a', marginTop: 6 }}>⚠ {err}</div>}
      </div>
    </div>
  )
}
