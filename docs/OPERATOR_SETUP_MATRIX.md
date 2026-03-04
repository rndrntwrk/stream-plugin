# 555stream Operator Setup Matrix

This matrix is the canonical config reference for agents/operators using `@elizaos-plugins/plugin-555stream`.

## 1) Minimum Live (3-step path)

Required:

| Variable | Required | Example | Notes |
|---|---|---|---|
| `STREAM555_BASE_URL` | Yes | `https://stream.rndrntwrk.com` | Control-plane base URL |
| `STREAM555_AGENT_TOKEN` | Yes | `eyJ...` | Agent bearer token from `/api/agent/v1/auth/token` |

Optional:

| Variable | Default | Notes |
|---|---|---|
| `STREAM555_DEFAULT_SESSION_ID` | unset | Reuses/auto-binds a specific session |
| `STREAM555_REQUIRE_APPROVALS` | `true` | Keep enabled in production |

## 2) Full Stream Operations

In addition to minimum live:

- Configure destinations with `STREAM555_PLATFORM_CONFIG` + `STREAM555_PLATFORM_TOGGLE`.
- Use `STREAM555_STREAM_START` or `STREAM555_GO_LIVE_APP` for launch.
- Control overlays/chat/ads using the `STREAM555_*` action surface.

No extra env vars are required for these actions beyond auth + base URL.

## 3) Milaidy Built-in Extensions (optional)

If using Milaidy built-ins alongside canonical stream plugin:

| Surface | Typical envs | Purpose |
|---|---|---|
| `stream555-auth` | `STREAM555_ADMIN_API_KEY` (optional) | API key lifecycle + wallet auth helper actions |
| `stream555-ads` | `STREAM555_DEFAULT_SESSION_ID` | session-scoped ad listing/triggering |
| `five55-games` | `STREAM555_BASE_URL`, `STREAM555_AGENT_TOKEN` | game catalog/play orchestration via agent-v1 |

## 4) Presets

### Preset A — Minimal go-live

```env
STREAM555_BASE_URL=https://stream.rndrntwrk.com
STREAM555_AGENT_TOKEN=<agent-token>
STREAM555_REQUIRE_APPROVALS=true
```

### Preset B — Go-live + stable session binding

```env
STREAM555_BASE_URL=https://stream.rndrntwrk.com
STREAM555_AGENT_TOKEN=<agent-token>
STREAM555_DEFAULT_SESSION_ID=<session-id>
STREAM555_REQUIRE_APPROVALS=true
```

### Preset C — Milaidy + games + ads

```env
STREAM555_BASE_URL=https://stream.rndrntwrk.com
STREAM555_AGENT_TOKEN=<agent-token>
STREAM555_DEFAULT_SESSION_ID=<session-id>
STREAM555_REQUIRE_APPROVALS=true
STREAM555_ADMIN_API_KEY=<optional-admin-key>
```

## 5) Security baseline

- Never commit tokens/keys.
- Keep approvals enabled in production.
- Rotate `STREAM555_AGENT_TOKEN` on operator handoff.
- Scope tokens to minimum required permissions when possible.
