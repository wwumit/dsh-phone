# dsh-phone 插件实验：对话中调出电话机（最小浮窗）

> 状态：实验计划（v0.1）
> 日期：2026-08-20
> 原则：**不在主实例（web profile / 3080）上做实验；每一步可回退**
> 目标：DSH Web UI 对话区弹出一个电话机浮窗（拨号盘 + 来电显示），调 registry phone/resolve 实时解析号码信任

---

## 一、要验证的核心假设

"**客户端插件（client plugin）能否在 DSH 对话区注入一个电话机浮窗，并消费 CHA2A 号码簿**"——对话中"调出手机"的最小形态。

## 二、实验形态（安全隔离）

```
主实例（web profile, 3080）──── 不动 ──── 我的工具调用不受影响
        │
        └─ 实验：独立 profile + 临时 patch 挂 dsh-phone client 插件
           pnpm dsh --profile test-phone --patch ./dsh-phone.patch.yml
           （独立命名 profile · 临时 patch · client bundle 构建后挂载）
```

## 三、执行步骤与回退点

| 步骤 | 动作 | 回退方式 |
|---|---|---|
| S0 | 快照：DSH 源码 git 状态、web profile patch | git stash / 记录 |
| S1 | dsh-phone client 插件源码（slot 注册 + React 浮窗）✅ 已写 | 删目录 |
| S2 | 构建配置（tsdown client bundle，参照 ui-commands）| 还原 |
| S3 | 构建 client bundle（tsdown build）| 删产物 |
| S4 | 独立 profile + cordis patch 挂 dsh-phone（browser roster 模式）| 删 profile |
| S5 | 跑 `pnpm dsh --profile test-phone --patch ...` → 打开 Web UI | 独立 profile，跑完即弃 |
| S6 | 观察：浮窗按钮出现 → 拨号 → 来电显示（号码→DID+信任）| 无副作用 |

## 四、安全护栏

1. **独立 profile**：只挂 test-phone，绝不写 web profile
2. **临时 patch**：不修改任何持久配置
3. **不发布 npm**：本地目录实验
4. **主实例零接触**：3080 进程、web profile、我的会话全部不动
5. **client bundle 本地构建**：不动 DSH 仓库内 packages

## 五、验收标准

- [ ] test-phone 的 Web UI 出现 📞 浮窗按钮
- [ ] 点击弹出电话机（拨号盘 + 输入框）
- [ ] 拨号 → 调 `/api/v1/phone/resolve` → 显示被叫 Agent 身份 + 信任标记
- [ ] 主实例（web）全程未受影响

## 六、待确认（构建/挂载路径，子代理调研中）

- [ ] client 插件独立于仓库外的构建方式（tsdown 配置模板）
- [ ] cordis patch 挂 client 插件（browser roster）的条目格式
- [ ] 独立 profile 加载 client bundle 的命令与前置（dev:web watcher 是否需要）
