# Changelog

## [2.0.0] - 2026-08-25

### Added — message protocol v2 (major)
- **Text length 10k** (was 2000); long content via text attachments (`attachment.kind=text` + `chars`) — agent reads full text into LLM context (up to 50k chars, truncated beyond)
- **@ mention gate granularity**: partially-denied mentions now deliver to allowed agents + return `denied` list; only all-denied returns 409 `TRUST_GATE_DENIED`
- **Message state machine**: `status` (active/recalled/deleted), `deliveredAt`, `readAt`; recall endpoint `POST /message/recall` (sender-only, 403 otherwise)
- **Agent capability declaration**: `metadata.capabilities` on register; exposed in `members-detail`; `@` selector shows capability tags
- **Structured messages**: `kind=card` + `payload` (title/fields/actions) — validated (card without payload → 400)
- **Group message history pagination**: `GET /group/<id>/messages?since=&limit=` (aggregates all member inboxes)
- **Unified error format**: `{error, code, detail}` across message paths
- **Reply attribution**: `[agent回复·<short>]` prefix + `agent: {did, name, level}` field (multi-agent groups distinguishable)

### Fixed
- **Broadcast excludes sender** (self-DID and self-fromNumber no longer receive own messages)
- **@ self no longer delivers** to own session (sendSmsToAgent + sendGroup double guard)
- **node half resolveSession**: falls back through registry `alternatives` when primary session is stale (restart changes session id → was stuck "session not found", no replies)
- **Signal TTL 5min**: stale offer/candidate from inbox no longer retriggers ringing on refresh
- **Own level from `trust/query`** (DID document has no top-level level)
- **Group messages via pagination endpoint** (not own-inbox filter) — own sent messages stay visible/right-aligned
- **All hardcoded numbers/DIDs removed** (env-driven only); STUN server derived from PHONE_BASE (DSH_PHONE_STUN overridable); removed dead `CALLER_NUM`

## [1.0.0] - 2026-08-24
