# OpenClaw Stream Skill

Use this skill when OpenClaw-driven agents need to integrate with 555stream overlays and live control.

## Scope
- Stream session lifecycle integration
- Overlay/template operations
- Ad-aware transitions
- Safety-first control constraints

## Integration Sequence
1. Run stream operator 3-step boot (`STREAM555_HEALTHCHECK`, `STREAM555_BOOTSTRAP_SESSION`, `STREAM555_STREAM_START` or `STREAM555_GO_LIVE_APP`).
2. Start OpenClaw-facing visual context with scene/layout baseline.
3. Use templates + overlay suggestions for contextual graphics:
   - `STREAM555_TEMPLATE_LIST`
   - `STREAM555_TEMPLATE_APPLY`
   - `STREAM555_OVERLAY_SUGGEST`

## Operational Rules
- Treat OpenClaw suggestions as advisory unless operator has enabled auto-apply.
- Always verify active scene before applying transitions or overlays.
- Keep ad breaks isolated: pause transition-heavy actions while an ad break is active.
- Preserve viewer readability: avoid stacking multiple high-contrast overlays.

## Recommended Action Set
- Scene changes: `STREAM555_SCENE_TRANSITION`, `STREAM555_SCENE_SET_ACTIVE`
- Overlay controls: `STREAM555_GRAPHICS_CREATE`, `STREAM555_GRAPHICS_UPDATE`, `STREAM555_GRAPHICS_TOGGLE`
- Monetization slots: `STREAM555_AD_LIST`, `STREAM555_AD_BREAK_TRIGGER`, `STREAM555_AD_BREAK_DISMISS`
- Live feedback: `STREAM555_CHAT_READ`, `STREAM555_CHAT_SEND`

## Failure Handling
- If overlay/template apply fails, fall back to direct graphics actions.
- If scene transition fails, issue `STREAM555_SCENE_SET_ACTIVE` as deterministic fallback.
- If ad render check fails, dismiss ad break and restore baseline scene before retry.
