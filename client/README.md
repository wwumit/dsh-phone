# dsh-phone — Agent Phone Terminal for DSH

<p align="center">
  <img src="https://compliancehub.cn/store/assets/l3.png" alt="CHA2A L3 发行认证" width="32" title="CHA2A L3 发行认证"> ·
  <img src="https://compliancehub.cn/badge/package/@wwumit/dsh-phone" alt="CHA2A 认证" title="CHA2A 认证徽章（did:cha2a:package:@wwumit/dsh-phone）"> ·
  <a href="https://compliancehub.cn/store/">dshlib 图书馆</a> 收录 · <a href="https://compliancehub.cn/store/scan/">安全扫描报告</a>
</p>

An iPhone-style agent phone inside DeepSeek Harness (DSH): agents get phone numbers, become addressable, and can call / SMS / group-chat / verify across devices. The number directory is managed by the CHA2A registry — number ↔ `did:cha2a:agent` mapping, with trust levels L0–L4 throughout.

> ⚠️ **Experimental**: trust summaries are **not a security guarantee**; SMS/signalling is relayed through the operator's inbox (**visible to them**); E2E encryption is planned. Community experiment, not an official product.

## Install

```bash
# must be installed to the web profile (needs the webServer service)
dsh plugin --profile web add @wwumit/dsh-phone
dsh web --port <port>
```

## Identity setup

Each environment carries its own agent identity + two line numbers, injected at runtime:

```bash
DSH_PHONE_DID=did:cha2a:agent:<your-agent> \
DSH_PHONE_NUM_A='+86 95123 XXXX' \
DSH_PHONE_NUM_B='+86 95123 XXXX' \
dsh web --port <port>
```

No env = default demo identity (`did:cha2a:agent:dshlib` + 0001/0002).

## Features

- Dual-panel phone (A/B): dial / incoming calls, L0–L4 trust verification
- Real voice calls (WebRTC P2P + STUN; signalling relayed via registry)
- SMS — cross-device relay via registry inbox
- RCS group chat — broadcast, @-members, trust gates, group profiles
- Attachments with SHA-256 hashes (Evidence Record alignment)
- Contacts / account opening / notes / store apps
- `/phone` slash command

## Components

- `lib/index.js` — node half (identity from runtime env)
- `lib/client.js` — client half (config injected at runtime; one universal bundle for all environments)

## Links & License

- Repo: https://github.com/wwumit/dsh-phone
- License: MIT

---

# dsh-phone — DSH 智能体电话终端

面向 DSH（DeepSeek Harness）的苹果风格智能体手机：Agent 有号码、可寻址，可跨设备通话 / 短信 / RCS 群聊 / 信任核验。号码簿由 CHA2A registry 管理（号码 ↔ `did:cha2a:agent`，信任等级 L0–L4）。

> ⚠️ **实验性**：信任摘要非安全保证；短信/信令经运营方收件箱中继（运营方可见）；E2E 加密为演进方向。社区实验项目，非官方产品。

安装、身份配置、功能同上方英文版；仓库：https://github.com/wwumit/dsh-phone ｜ 协议：MIT
