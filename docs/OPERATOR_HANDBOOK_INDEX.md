# 555 Stream Operator Handbook Index

This is the canonical entrypoint for the stream operator surface.

Use this file when you need one reading path from install through live operation,
recovery, and release review.

## Reading path

1. `GET_STARTED.md`
   shortest correct path to a working stream setup
2. `INSTALL_AND_AUTH.md`
   auth model, setup, and session prerequisites
3. `OPERATOR_SETUP_MATRIX.md`
   configuration by runtime and deployment context
4. `ACTIONS_REFERENCE.md`
   operator action surface and expected arguments
5. `COMPLEX_FLOWS.md`
   multi-step flows and orchestration patterns
6. `OPERATOR_JOURNEY.md`
   default, advanced, and recovery-oriented operator paths
7. `EDGE_CASES_AND_RECOVERY.md`
   recovery guidance and failure handling
8. `RUNBOOK_PACK.md`
   canonical setup, go-live, incident, and release-review runbook set
9. `STREAM_MASTERY_LANE.md`
   operator maturity model and proof expectations
10. `STREAM_RELEASE_READINESS_MEMO.md`
   current release-readiness decision and required evidence

## Approval-bound operations

Use these docs whenever a stop, fallback, delete, or other sensitive action is
involved:

- `approval-api.md`
- `approval-ui.md`

## State and release docs

- `STATES_AND_TRANSITIONS.md`
- `state-diagrams.md`
- `PLUGIN_RELEASE_P0_CHECKLIST.md`
- `PUBLIC_RELEASE_CHECKLIST.md`

## Evidence sources

The operator handbook is canonical for the interface. Runtime proof and release
evidence live in the stream repo:

- `../555stream/ECOSYSTEM_EVIDENCE_INDEX.md`
- `../555stream/MANUAL_TESTING_INDEX.md`
- `../555stream/STREAM_RELEASE_READINESS_MEMO_2026-03-25.md`

If these disagree, fix the disagreement rather than creating a third source.
