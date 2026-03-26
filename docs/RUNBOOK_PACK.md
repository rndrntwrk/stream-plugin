# 555 Stream Runbook Pack

This file defines the canonical runbook set for setup, go-live, incident, and
recovery.

## Setup runbook

- `GET_STARTED.md`
- `INSTALL_AND_AUTH.md`
- `OPERATOR_SETUP_MATRIX.md`

Use when bringing up a new operator environment.

## Go-live runbook

- `GET_STARTED.md`
- `OPERATOR_JOURNEY.md`
- `ACTIONS_REFERENCE.md`

Use when preparing a normal live launch.

## Incident runbook

- `EDGE_CASES_AND_RECOVERY.md`
- `approval-api.md`
- `approval-ui.md`

Use when the stream is degraded, approvals are blocking, or auth/session state
is inconsistent.

## Release review runbook

- `STREAM_RELEASE_READINESS_MEMO.md`
- `PLUGIN_RELEASE_P0_CHECKLIST.md`
- `PUBLIC_RELEASE_CHECKLIST.md`

Use when deciding whether the stream surface is operator-ready to promote.

## Rule

If a new stream doc is written and it affects setup, go-live, incident, or
release review, this pack must be updated in the same change.
