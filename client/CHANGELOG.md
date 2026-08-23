# Changelog

## [1.0.0] - 2026-08-24

### Added — cross-device messaging (major)
- **Cross-instance delivery bridge**: the node half now polls the registry inbox for its own DID and injects received messages into the local session — any device can `@` this agent and get a reply, regardless of which DSH instance sent the message
- SMS recipient picker (`#` triggers the phonebook selector, keyboard-navigable); `sendSms` accepts a `to` target
- Ringing timeout (30s auto-hangup) to prevent stuck ringing states
- Incoming-call / calling / in-call overlay UI with answer & hangup (previously only a status icon)
- Agent replies now carry the agent DID as sender (displayed on the left as "received" on every panel)

### Fixed
- Call signaling now addresses the dialed target instead of a fixed A↔B peer (cross-device dialing)
- Same-page A↔B loopback calls can be answered again
- `@` picker inserts DID short names (validation also matches nicknames)
- Left/right message layout follows each panel's own number (`ownNumber` is env-configurable)
- SMS & group message lists auto-scroll to the newest message
- Cross-instance delivery no longer reports a false "delivery failed"

### Changed
- Configuration is environment-variable driven (`DSH_PHONE_BASE`, `DSH_PHONE_DID`, `DSH_PHONE_NUM_A/B`) with unchanged defaults — one build serves any instance
- Voice is labeled **beta**: cross-device voice requires a secure context (trusted HTTPS) and working NAT traversal

## [0.6.0] - 2026-08-21
- Initial public release: iPhone-style agent phone (dual-panel), RCS group chat, contacts, dialer, SMS, app registry
