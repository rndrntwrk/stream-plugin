# 555stream Plugin — 3-Step Quickstart

## Prerequisites
- `STREAM555_BASE_URL`
- `STREAM555_AGENT_TOKEN`

## Step 1: Authenticate
Invoke:
- `STREAM555_HEALTHCHECK`
- `STREAM555_BOOTSTRAP_SESSION`

Expected:
- health check passes
- session is bound and cached

## Step 2: Configure
Typical sequence:
- `STREAM555_PLATFORM_CONFIG` per destination
- `STREAM555_PLATFORM_TOGGLE` to enable destinations
- optional `STREAM555_LAYOUT_SET` / `STREAM555_SCENE_SET_ACTIVE`

## Step 3: Go Live
Choose one:
- `STREAM555_STREAM_START` (camera/screen/rtmp/radio/composition)
- `STREAM555_GO_LIVE_APP` (website capture via app catalog or direct URL)

## Optional post-start controls
- Ads: `STREAM555_AD_LIST`, `STREAM555_AD_BREAK_TRIGGER`
- Alerts: `STREAM555_ALERT_CREATE`
- Chat: `STREAM555_CHAT_START`, `STREAM555_CHAT_READ`, `STREAM555_CHAT_SEND`
- Status: `STREAM555_STREAM_STATUS`
