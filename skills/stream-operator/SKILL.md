# Stream Operator Skill

Use this skill when an agent must run a 555stream session safely in production.

## Objective
Get live in 3 steps with explicit checks and reversible operations:
1. Authenticate
2. Configure
3. Go live

## Workflow
### 1) Authenticate
- Run `STREAM555_HEALTHCHECK`.
- Run `STREAM555_BOOTSTRAP_SESSION` (reuse a known `sessionId` when provided).
- Confirm provider state reports bound session + ready service.

### 2) Configure
- Configure outputs using `STREAM555_PLATFORM_CONFIG`.
- Enable outputs with `STREAM555_PLATFORM_TOGGLE`.
- Apply layout/scene defaults via `STREAM555_LAYOUT_SET` and/or `STREAM555_SCENE_SET_ACTIVE`.
- If app stream mode is needed, inspect `STREAM555_APP_LIST` first.

### 3) Go live
- Use `STREAM555_STREAM_START` for camera/screen/composition inputs.
- Use `STREAM555_GO_LIVE_APP` for website-capture app viewers.
- Confirm `STREAM555_STREAM_STATUS` is active and includes expected output/session metadata.

## Safety Rules
- Require approvals for start/stop and ad-trigger operations in production.
- Never overwrite destination credentials unless explicitly instructed.
- Prefer idempotent operations (read status before mutate).
- On failure: capture error + upstream status + session ID before retrying.

## Recovery
- If stream start fails with output provisioning errors, run stop/start recovery path.
- If app viewer path fails, verify public URL reachability and app catalog metadata.
- If WebSocket state is stale, re-bootstrap session before issuing control actions.
