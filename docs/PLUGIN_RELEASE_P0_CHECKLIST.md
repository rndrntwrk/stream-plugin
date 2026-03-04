# Plugin Release P0 Checklist (Tonight)

Target: publish `@rndrntwrk/plugin-555stream` with safe defaults and operator-ready setup.

## Hard gate

1. Build/typecheck passes.
2. `scripts/audit-expert-plugin-structure.mjs` passes in monorepo.
3. 3-step docs and config matrix are current.
4. Stream start/stop + ad trigger actions are exposed in plugin action registry.
5. Rollback instructions documented.

## Validation commands

From monorepo root:

```bash
node scripts/audit-expert-plugin-structure.mjs
```

From plugin repo:

```bash
cd stream-plugin
npm run typecheck
npm run build
```

## Runtime smoke sequence

1. `STREAM555_HEALTHCHECK`
2. `STREAM555_BOOTSTRAP_SESSION`
3. `STREAM555_PLATFORM_CONFIG`
4. `STREAM555_PLATFORM_TOGGLE`
5. `STREAM555_STREAM_START` (or `STREAM555_GO_LIVE_APP`)
6. `STREAM555_STREAM_STATUS`
7. `STREAM555_AD_LIST` + `STREAM555_AD_BREAK_TRIGGER`
8. `STREAM555_STREAM_STOP`

## Release outputs

- `README.md` docs map + quickstart.
- `docs/OPERATOR_SETUP_MATRIX.md`.
- `docs/MILAIDY_WEB_ACCESS.md`.
- `docs/QUICKSTART_3_STEPS.md`.

## Rollback

1. Unpublish/deprecate the release tag if needed.
2. Re-pin consumers to last known-good plugin version.
3. Keep runtime approvals enabled during rollback to avoid unsafe operations.
4. Re-run smoke sequence on pinned version.
