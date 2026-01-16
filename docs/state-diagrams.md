# 555stream Plugin - State Diagrams

This document describes the complete state machines for the 555stream elizaOS plugin.

## Table of Contents

1. [Agent-Plugin Lifecycle](#1-agent-plugin-lifecycle)
2. [Approval Flow](#2-approval-flow)
3. [Action Execution](#3-action-execution)
4. [WebSocket Connection](#4-websocket-connection)
5. [Configuration Hierarchy](#5-configuration-hierarchy)

---

## 1. Agent-Plugin Lifecycle

The agent goes through several states when using the 555stream plugin.

```mermaid
stateDiagram-v2
    [*] --> UNINITIALIZED

    UNINITIALIZED --> INITIALIZED : Plugin.init() success
    UNINITIALIZED --> ERROR : Missing env vars

    INITIALIZED --> CONNECTING : BOOTSTRAP_SESSION action

    CONNECTING --> BOUND : WS bind success
    CONNECTING --> ERROR : Bind timeout (10s)

    BOUND --> RECONNECTING : WS disconnect/error

    RECONNECTING --> BOUND : Reconnect + rebind success
    RECONNECTING --> ERROR : Max 10 retries exceeded

    state BOUND {
        [*] --> Ready
        Ready --> StreamControl
        Ready --> StudioControl
        Ready --> MediaOps
        Ready --> GuestMgmt
        StreamControl --> Ready
        StudioControl --> Ready
        MediaOps --> Ready
        GuestMgmt --> Ready
    }

    ERROR --> [*]
```

### State Descriptions

| State | Description | Available Actions |
|-------|-------------|-------------------|
| **UNINITIALIZED** | Plugin not loaded | None |
| **INITIALIZED** | Service created, HTTP/WS clients ready | HEALTHCHECK |
| **CONNECTING** | HTTP session created, WS handshake in progress | None (waiting) |
| **BOUND** | Ready state - all 26 actions available | All actions |
| **RECONNECTING** | Auto-retry with exponential backoff | Read-only |
| **ERROR** | Manual intervention required | None |

### Transitions

| From | To | Trigger | Side Effects |
|------|----|---------|--------------|
| UNINITIALIZED | INITIALIZED | `Plugin.init()` success | Service created |
| UNINITIALIZED | ERROR | Missing env vars | Error thrown |
| INITIALIZED | CONNECTING | `BOOTSTRAP_SESSION` | HTTP POST /sessions |
| CONNECTING | BOUND | WS bind success | State cache populated |
| CONNECTING | ERROR | Bind timeout | Action fails |
| BOUND | RECONNECTING | WS close/error | Auto-reconnect scheduled |
| RECONNECTING | BOUND | Reconnect + rebind | State cache refreshed |
| RECONNECTING | ERROR | 10 retries exhausted | WS enters error state |

---

## 2. Approval Flow

Actions requiring human approval go through this state machine.

```mermaid
stateDiagram-v2
    [*] --> ActionCalled

    ActionCalled --> PENDING : No _approvalId
    ActionCalled --> CheckApproval : Has _approvalId

    CheckApproval --> EXECUTED : status = approved
    CheckApproval --> REJECTED_RESPONSE : status = rejected
    CheckApproval --> EXPIRED_RESPONSE : status = expired
    CheckApproval --> PENDING_RESPONSE : status = pending

    PENDING --> APPROVED : POST /approve
    PENDING --> REJECTED : POST /reject
    PENDING --> EXPIRED : Auto (5 min TTL)

    APPROVED --> AgentReInvokes
    AgentReInvokes --> EXECUTED

    REJECTED --> REJECTED_RESPONSE
    EXPIRED --> EXPIRED_RESPONSE
    EXPIRED --> ActionCalled : Agent retries

    EXECUTED --> [*]
    REJECTED_RESPONSE --> [*]
    EXPIRED_RESPONSE --> [*]
```

### Approval States

| State | HTTP Code | Duration | Can Transition To |
|-------|-----------|----------|-------------------|
| **PENDING** | 200 | Up to 5 minutes | APPROVED, REJECTED, EXPIRED |
| **APPROVED** | 200 | Terminal | (execution) |
| **REJECTED** | 200 | Terminal | (error response) |
| **EXPIRED** | 410 | Terminal | (new approval request) |

### Actions Requiring Approval

| Action | Risk Level | Reason |
|--------|------------|--------|
| `STREAM555_STREAM_START` | HIGH | Goes live to platforms |
| `STREAM555_STREAM_STOP` | HIGH | Stops live stream |
| `STREAM555_STREAM_FALLBACK` | HIGH | Changes stream source |
| `STREAM555_GRAPHICS_DELETE` | MEDIUM | Permanent deletion |
| `STREAM555_SOURCE_DELETE` | MEDIUM | Permanent deletion |
| `STREAM555_GUEST_INVITE` | MEDIUM | External access |
| `STREAM555_GUEST_REMOVE` | MEDIUM | Kicks participant |
| `STREAM555_VIDEO_DELETE` | MEDIUM | Permanent deletion |

**Conditional:** `STREAM555_PLATFORM_CONFIG` requires approval only when setting stream keys.

---

## 3. Action Execution

Every action follows this execution flow.

```mermaid
flowchart TD
    A[Action Triggered] --> B{Validation}

    B -->|Pass| C{Check Approval}
    B -->|Fail| D[Return Error]

    C -->|No approval needed| E[Execute Directly]
    C -->|Has valid approval| F[Execute with Approval]
    C -->|Has pending approval| G[Return Pending]
    C -->|Rejected/Expired| H[Return Error]

    E --> I[HTTP Request]
    F --> I

    I -->|Success| J[Return Success]
    I -->|Error| K[Return Error]

    G --> L[Agent informs user]
    L --> M[Operator approves/rejects]
    M --> N[Agent re-invokes]
    N --> A
```

### Validation Checks

1. Service exists and is initialized
2. Session is bound (for most actions)
3. Required parameters are present
4. Parameter types are valid

### Result States

| State | Structure | When |
|-------|-----------|------|
| **Success** | `{ success: true, data: {...} }` | Action completed |
| **Pending** | `{ success: false, pending: true, approvalId: "..." }` | Awaiting approval |
| **Rejected** | `{ success: false, error: "Rejected by operator" }` | Approval denied |
| **Expired** | `{ success: false, error: "Approval expired" }` | 5 min TTL exceeded |
| **Error** | `{ success: false, error: "..." }` | Validation/execution failed |

---

## 4. WebSocket Connection

The WebSocket client manages real-time communication.

```mermaid
stateDiagram-v2
    [*] --> DISCONNECTED

    DISCONNECTED --> CONNECTING : connect() called

    CONNECTING --> CONNECTED : 'open' event
    CONNECTING --> ERROR : 'error' event
    CONNECTING --> DISCONNECTED : 'close' event

    CONNECTED --> BINDING : bind() called
    CONNECTED --> ERROR : 'error' event

    BINDING --> READY : 'bound' message
    BINDING --> ERROR : 'error' message
    BINDING --> ERROR : timeout (10s)

    READY --> RECONNECTING : 'close' event
    READY --> RECONNECTING : pong timeout (50s)

    RECONNECTING --> CONNECTING : schedule (exp. backoff)
    RECONNECTING --> FATAL_ERROR : max retries (10)

    ERROR --> RECONNECTING : retries < 10
    ERROR --> FATAL_ERROR : retries >= 10

    FATAL_ERROR --> [*]
```

### Connection Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `reconnectInterval` | 5000ms | Base delay between reconnects |
| `maxReconnectAttempts` | 10 | Max retries before giving up |
| `pingInterval` | 25000ms | Keepalive ping frequency |
| `pongTimeout` | 50000ms | Max time to wait for pong (2x ping) |

### Reconnect Backoff

```
Attempt 1:  5 seconds
Attempt 2: 10 seconds
Attempt 3: 20 seconds
Attempt 4: 40 seconds
Attempt 5+: 60 seconds (max)
```

### WebSocket Messages

**Client → Server:**
```typescript
// Bind to session
{ type: 'bind', sessionId: string, token: string, clientId: string }

// Patch state
{ type: 'patch_state', sessionId: string, requestId: string, patch: object }

// Keepalive
{ type: 'ping' }
```

**Server → Client:**
```typescript
// Bind success
{ type: 'bound', sessionId: string, productionState: object, sequence: number }

// State update
{ type: 'state_update', sessionId: string, productionState: object, sequence: number }

// Stream status
{ type: 'stream_status', sessionId: string, active: boolean, jobId?: string }

// Platform status
{ type: 'platform_status', sessionId: string, platformId: string, status: string }

// Stats
{ type: 'stats', sessionId: string, fps?: number, kbps?: number, duration?: string }

// Acknowledgment
{ type: 'ack', requestId: string, sequence?: number }

// Error
{ type: 'error', requestId?: string, error: string }

// Keepalive response
{ type: 'pong' }
```

---

## 5. Configuration Hierarchy

Configuration flows from environment variables through the plugin to actions.

```mermaid
flowchart TD
    subgraph Environment
        A[STREAM555_BASE_URL]
        B[STREAM555_AGENT_TOKEN]
        C[STREAM555_DEFAULT_SESSION_ID]
        D[STREAM555_REQUIRE_APPROVALS]
    end

    subgraph PluginConfig
        E[Stream555Config]
    end

    subgraph ActionLevel
        F[Per-action approval check]
        G[withApproval helper]
    end

    subgraph ApprovalRoutes
        H[setApprovalAuthToken]
        I[verifyAuth on endpoints]
    end

    A --> E
    B --> E
    C --> E
    D --> E

    E --> F
    E --> H

    F --> G
    H --> I
```

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `STREAM555_BASE_URL` | Yes | - | 555stream control-plane URL |
| `STREAM555_AGENT_TOKEN` | Yes | - | Bearer token for API |
| `STREAM555_DEFAULT_SESSION_ID` | No | - | Auto-bind session on startup |
| `STREAM555_REQUIRE_APPROVALS` | No | `true` | Enable approval flow |

### REQUIRE_APPROVALS Effect

| Value | Behavior |
|-------|----------|
| `true` (default) | 8 dangerous actions require operator approval |
| `false` | All actions execute immediately (**DEVELOPMENT ONLY**) |

---

## Complete Interaction Sequence

Here's the full flow for an agent starting a stream with approval:

```mermaid
sequenceDiagram
    participant User
    participant Agent
    participant Plugin
    participant API as 555stream API
    participant Operator as Operator Dashboard

    User->>Agent: "Start the stream"
    Agent->>Plugin: STREAM_START (no approvalId)
    Plugin->>Plugin: Create approval (PENDING)
    Plugin-->>Agent: {pending: true, approvalId: "abc123"}
    Agent-->>User: "Approval required - ID: abc123"

    Operator->>API: GET /approvals
    API-->>Operator: [pending approval displayed]
    Operator->>API: POST /approve
    API-->>Plugin: status = APPROVED

    User->>Agent: "Try again"
    Agent->>Plugin: STREAM_START (_approvalId: "abc123")
    Plugin->>Plugin: Check approval (APPROVED)
    Plugin->>API: POST /stream/start
    API-->>Plugin: {jobId, status}
    Plugin-->>Agent: {success: true, data: {jobId}}
    Agent-->>User: "Stream started! Job: xyz"
```

---

## Summary

The 555stream plugin uses a multi-layered state machine approach:

1. **Agent Lifecycle** - Manages connection and readiness
2. **Approval Flow** - Protects dangerous operations
3. **Action Execution** - Validates and routes requests
4. **WebSocket Connection** - Maintains real-time sync
5. **Configuration** - Controls behavior at multiple levels

This architecture ensures:
- **Safety**: Dangerous actions require explicit approval
- **Reliability**: Auto-reconnect with exponential backoff
- **Visibility**: Real-time state sync via WebSocket
- **Flexibility**: Configurable approval requirements
