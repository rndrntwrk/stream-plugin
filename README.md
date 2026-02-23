# @elizaos-plugins/plugin-555stream

elizaOS plugin for AI agent control of [555stream](https://555.tv) live streaming studio via the Agent Control API.

## Features

- **27 Actions** for complete stream control
- **Real-time State Sync** via WebSocket
- **Approval Flow** for dangerous operations
- **HTTP + WebSocket Client** for Agent Control API
- **Session Management** with auto-reconnect

## Installation

```bash
bun add @elizaos-plugins/plugin-555stream
```

Or with npm:

```bash
npm install @elizaos-plugins/plugin-555stream
```

## Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `STREAM555_BASE_URL` | Yes | 555stream control-plane URL (e.g., `https://stream.rndrntwrk.com`) |
| `STREAM555_AGENT_TOKEN` | Yes | Agent JWT token from 555stream dashboard or API |
| `STREAM555_DEFAULT_SESSION_ID` | No | Auto-bind to this session on startup |
| `STREAM555_REQUIRE_APPROVALS` | No | Require approval for dangerous actions (default: `true`) |

### Example `.env`

```env
STREAM555_BASE_URL=https://stream.rndrntwrk.com
STREAM555_AGENT_TOKEN=eyJhbGciOiJIUzI1NiIs...
STREAM555_DEFAULT_SESSION_ID=abc123
STREAM555_REQUIRE_APPROVALS=true
```

## Quick Start

### 1. Add the plugin to your character file

```json
{
  "name": "555stream Operator",
  "bio": [
    "Operates 555stream live sessions safely and reliably.",
    "Uses explicit approval gates for high-impact actions."
  ],
  "system": "You control a production live streaming studio. Be safe, deliberate, and reversible. Never start/stop streams without explicit operator approval.",
  "plugins": [
    "@elizaos/plugin-sql",
    "@elizaos/plugin-bootstrap",
    "@elizaos-plugins/plugin-555stream"
  ]
}
```

### 2. Get an Agent Token

#### Option A: Via Admin API (Recommended)

If you have admin access to the 555stream control-plane, generate a token using the API:

```bash
curl -X POST https://stream.rndrntwrk.com/api/agent/v1/auth/token \
  -H "X-Admin-Key: YOUR_ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "scopes": ["*"],
    "sessionIds": ["*"],
    "expiresIn": "7d"
  }'
```

**Response:**
```json
{
  "token": "eyJhbGciOiJSUzI1NiIs...",
  "expiresAt": "2025-01-23T00:00:00.000Z",
  "scopes": ["*"],
  "sessionIds": ["*"]
}
```

#### Token Scopes

You can limit agent permissions with specific scopes:

| Scope | Permissions |
|-------|-------------|
| `*` | Full access (all operations) |
| `sessions:read` | Read session state |
| `sessions:create` | Create/bind sessions |
| `stream:start` | Start streams |
| `stream:stop` | Stop streams |
| `studio:write` | Modify graphics, layouts |
| `sources:write` | Manage sources |
| `media:write` | Upload media |
| `platforms:write` | Configure platforms |
| `radio:write` | Control radio |

#### Option B: Via 555stream Dashboard

1. Log in to your 555stream dashboard
2. Navigate to **Settings > Agent Access**
3. Click **Generate Token**
4. Select permissions and expiry
5. Copy the generated token

### 3. Set environment variables

```bash
export STREAM555_BASE_URL=https://stream.rndrntwrk.com
export STREAM555_AGENT_TOKEN=your_token_here
```

### 4. Start your elizaOS agent

The plugin will automatically connect to the 555stream control-plane and bind to the default session if configured.

## Actions Reference

### Session Management

| Action | Description | Approval |
|--------|-------------|----------|
| `STREAM555_HEALTHCHECK` | Check API connectivity | No |
| `STREAM555_BOOTSTRAP` | Bind to a session | No |

### Stream Control

| Action | Description | Approval |
|--------|-------------|----------|
| `STREAM555_STREAM_START` | Start streaming to platforms | **Yes** |
| `STREAM555_GO_LIVE_APP` | Start website-capture stream for an app viewer URL | **Yes** |
| `STREAM555_STREAM_STOP` | Stop all active streams | **Yes** |
| `STREAM555_STREAM_FALLBACK` | Switch to fallback mode | **Yes** |
| `STREAM555_STREAM_STATUS` | Get current stream status | No |

#### App streaming (website capture)

Use `STREAM555_GO_LIVE_APP` to stream a game/app spectator UI (e.g., Babylon / Agent Town) via `input.type="website"`.

Parameters (via action `options`):
- `viewerUrl` (required): public `https://...` URL that `capture-service` can reach (avoid `localhost` unless `allowLocalhost=true`)
- `appName` (optional): short identifier (e.g., `"babylon"`)
- `scene` (optional): studio scene name (defaults to `"default"`)
- `app` (optional): metadata forwarded to 555stream as `options.app` for validation/auditing (viewer auth + requirements)

Example:
```json
{
  "viewerUrl": "https://babylon.social/",
  "appName": "babylon",
  "scene": "default",
  "app": {
    "name": "babylon",
    "viewer": { "postMessageAuth": false },
    "requirements": { "publicUrlRequired": true }
  }
}
```

### State Management

| Action | Description | Approval |
|--------|-------------|----------|
| `STREAM555_STATE_PATCH` | Update production state | Configurable |
| `STREAM555_LAYOUT_SET` | Set scene layout | No |
| `STREAM555_SCENE_SET_ACTIVE` | Switch active scene | No |

### Graphics

| Action | Description | Approval |
|--------|-------------|----------|
| `STREAM555_GRAPHICS_CREATE` | Create a graphic overlay | No |
| `STREAM555_GRAPHICS_UPDATE` | Update graphic properties | No |
| `STREAM555_GRAPHICS_DELETE` | Delete a graphic | **Yes** |
| `STREAM555_GRAPHICS_TOGGLE` | Toggle graphic visibility | No |

### Sources

| Action | Description | Approval |
|--------|-------------|----------|
| `STREAM555_SOURCE_CREATE` | Add a video/audio source | No |
| `STREAM555_SOURCE_UPDATE` | Update source properties | No |
| `STREAM555_SOURCE_DELETE` | Remove a source | **Yes** |

### Guests

| Action | Description | Approval |
|--------|-------------|----------|
| `STREAM555_GUEST_INVITE` | Create guest invite link | **Yes** |
| `STREAM555_GUEST_REMOVE` | Remove a guest | **Yes** |

### Media

| Action | Description | Approval |
|--------|-------------|----------|
| `STREAM555_UPLOAD_IMAGE` | Upload image from URL | No |
| `STREAM555_UPLOAD_VIDEO` | Upload video from URL | No |
| `STREAM555_VIDEO_ADD_URL` | Add video by URL | No |
| `STREAM555_VIDEO_DELETE` | Delete a video asset | **Yes** |

### Platforms

| Action | Description | Approval |
|--------|-------------|----------|
| `STREAM555_PLATFORM_CONFIG` | Configure platform (RTMP, key) | **Yes** |
| `STREAM555_PLATFORM_TOGGLE` | Enable/disable platform | No |

### Radio (Lofi)

| Action | Description | Approval |
|--------|-------------|----------|
| `STREAM555_RADIO_CONFIG` | Configure radio settings | No |
| `STREAM555_RADIO_CONTROL` | Control radio playback | No |

## Providers

The plugin exposes two providers for the model context:

### STREAM555_STATE

Real-time session state including:
- Current scene and layout
- Active sources and graphics
- Stream status
- Connected guests

### STREAM555_CAPABILITIES

Available actions based on current state and permissions.

## Approval Flow

Actions marked with **Approval Required** use an async approval pattern to prevent accidental or unauthorized operations.

### How It Works

1. Agent calls a dangerous action (e.g., `STREAM555_STREAM_START`)
2. Plugin creates a pending approval request (expires in 5 minutes)
3. Agent responds: `"Approval required - ID: approval-1234567890-abc123def"`
4. **Operator** approves via API (see below)
5. Agent re-calls action with `_approvalId` parameter
6. Action executes

### Operator Approval API

The approval endpoints are served by **elizaOS** (not 555stream). Replace `localhost:3000` with your elizaOS deployment URL.

All approval endpoints require authentication with the agent token.

#### List Pending Approvals

```bash
# Replace localhost:3000 with your elizaOS URL
curl http://localhost:3000/555stream/approvals \
  -H "Authorization: Bearer YOUR_AGENT_TOKEN"
```

**Response:**
```json
{
  "approvals": [
    {
      "id": "approval-1705432100000-abc123def",
      "actionName": "STREAM555_STREAM_START",
      "actionParams": { "input": { "type": "lofi" } },
      "status": "pending",
      "createdAt": 1705432100000,
      "expiresAt": 1705432400000
    }
  ],
  "count": 1
}
```

#### Get Approval Details

```bash
curl http://localhost:3000/555stream/approvals/approval-1705432100000-abc123def \
  -H "Authorization: Bearer YOUR_AGENT_TOKEN"
```

#### Approve an Action

```bash
curl -X POST http://localhost:3000/555stream/approvals/approval-1705432100000-abc123def/approve \
  -H "Authorization: Bearer YOUR_AGENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"approvedBy": "operator@example.com"}'
```

**Response:**
```json
{
  "success": true,
  "approval": {
    "id": "approval-1705432100000-abc123def",
    "status": "approved",
    "resolvedAt": 1705432150000,
    "resolvedBy": "operator@example.com"
  }
}
```

#### Reject an Action

```bash
curl -X POST http://localhost:3000/555stream/approvals/approval-1705432100000-abc123def/reject \
  -H "Authorization: Bearer YOUR_AGENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"rejectedBy": "operator@example.com"}'
```

#### View Approval History

```bash
curl http://localhost:3000/555stream/approvals/history \
  -H "Authorization: Bearer YOUR_AGENT_TOKEN"
```

### After Approval

Once approved, the agent should re-invoke the action. The approval ID is passed automatically by the agent runtime or can be included manually:

```typescript
// Agent internally passes: { ...params, _approvalId: "approval-xxx" }
```

### Approval Expiry

- Approvals expire **5 minutes** after creation
- Expired approvals cannot be approved and must be re-requested
- Approval history is kept for 1 hour for audit purposes

### Disable Approvals (Development Only)

```env
STREAM555_REQUIRE_APPROVALS=false
```

**Warning:** Only disable approvals in development environments. In production, this exposes dangerous operations without human oversight.

## Development

```bash
# Install dependencies
bun install

# Build
bun run build

# Type check
bun run typecheck

# Watch mode
bun run dev
```

## Requirements

- elizaOS `^1.7.0`
- Node.js 18+ or Bun
- 555stream account with Agent API access

## License

MIT
