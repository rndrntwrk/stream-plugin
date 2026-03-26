# 555 Stream Operator Journey

Use this document when you need the full operator path, not just the shortest
bootstrap checklist.

## Default operator path

This is the expected path for a serious first-time operator.

1. Install and enable the plugin.
2. Verify auth and bootstrap a session.
3. Save and enable the intended output channels.
4. Choose the go-live surface:
   - direct studio start
   - app/website capture path
5. Confirm live state.
6. Operate the stream:
   - ads
   - chat
   - overlays and scene transitions
7. Stop safely and confirm the session returns to ready state.

## Advanced operator paths

### Recovery path

Use this when the operator is already installed but the stream is degraded.

1. Check `STREAM555_STREAM_STATUS`.
2. Identify whether the fault is:
   - auth/token
   - channel config
   - realtime/session
   - approval gating
3. Recover using `EDGE_CASES_AND_RECOVERY.md`.
4. Reconfirm status before any new mutating action.

### App / website go-live path

Use this when the source is not the default studio composition.

1. Inspect available sources with `STREAM555_APP_LIST`.
2. Pick the correct viewer/site target.
3. Invoke `STREAM555_GO_LIVE_APP`.
4. Verify active state and downstream channels.

### Alice/internal runtime path

Use this when the operator is Alice or another allow-listed internal runtime.

1. Confirm public vs internal base URL routing.
2. Confirm fixed/default session assumptions.
3. Keep approvals on.
4. Use the same status-before-mutation rule as the public path.

## Decision rules

- If the operator is new, teach the default path first.
- If the operator is debugging, use the recovery path instead of repeating the
  install flow.
- If the operator is using non-default capture, treat app/website go-live as a
  separate workflow, not a footnote.

## Related docs

- `GET_STARTED.md`
- `INSTALL_AND_AUTH.md`
- `EDGE_CASES_AND_RECOVERY.md`
- `STREAM_RELEASE_READINESS_MEMO.md`
