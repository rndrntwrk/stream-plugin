# Milaidy Web Access (Plugins + Controls)

This guide shows how operators expose the stream plugin controls inside Milaidy web/API surfaces.

## Install and enable

### CLI

```bash
milady plugins install @rndrntwrk/plugin-555stream
milady plugins configure @rndrntwrk/plugin-555stream \
  STREAM555_BASE_URL=https://stream.rndrntwrk.com \
  STREAM555_AGENT_TOKEN=<agent-token> \
  STREAM555_REQUIRE_APPROVALS=true
milady plugins enable @rndrntwrk/plugin-555stream
```

### REST API

Install:

```bash
curl -X POST http://localhost:3000/api/plugins/install \
  -H "Content-Type: application/json" \
  -d '{"name":"@rndrntwrk/plugin-555stream"}'
```

Configure + enable:

```bash
curl -X POST http://localhost:3000/api/plugins/configure \
  -H "Content-Type: application/json" \
  -d '{
    "name":"@rndrntwrk/plugin-555stream",
    "config":{
      "STREAM555_BASE_URL":"https://stream.rndrntwrk.com",
      "STREAM555_AGENT_TOKEN":"<agent-token>",
      "STREAM555_REQUIRE_APPROVALS":"true"
    },
    "enabled":true
  }'
```

## Web controls entrypoint

Once enabled, operators can manage plugin state from Milaidy:

- Plugins view: installed/enabled status + configuration values.
- App/tools chat: invoke `STREAM555_*` actions directly.
- Approval queue: `/555stream/approvals` endpoints served by Milaidy runtime.

## Suggested starter action sequence

1. `STREAM555_HEALTHCHECK`
2. `STREAM555_BOOTSTRAP_SESSION`
3. `STREAM555_PLATFORM_CONFIG`
4. `STREAM555_PLATFORM_TOGGLE`
5. `STREAM555_STREAM_START` (or `STREAM555_GO_LIVE_APP`)
6. `STREAM555_STREAM_STATUS`

## Companion plugin surfaces in Milaidy

For full 555 workflow inside Milaidy deployments:

- `stream555-auth` for auth key management and wallet auth routes.
- `stream555-ads` for ad inventory + trigger orchestration.
- `five55-games` for game launch/switch/play paths.

These can be enabled independently while stream control remains canonical in `plugin-555stream`.
