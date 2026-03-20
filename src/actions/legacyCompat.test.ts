import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import type { IAgentRuntime } from '../types/index.js';
import { legacyCompatibilityActions } from './legacyCompat.js';
import { streamStatusAction } from './streamStatus.js';
import { streamStopAction } from './streamStop.js';
import type { StreamControlService } from '../services/StreamControlService.js';

const ORIGINAL_ENV = new Map<string, string | undefined>();
const ORIGINAL_FETCH = globalThis.fetch;

function setEnv(key: string, value: string | undefined): void {
  if (!ORIGINAL_ENV.has(key)) {
    ORIGINAL_ENV.set(key, process.env[key]);
  }
  if (value === undefined) {
    delete process.env[key];
    return;
  }
  process.env[key] = value;
}

function buildJsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  };
}

function buildTextResponse(status: number, body: string) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
  };
}

function findAction(name: string) {
  const action = legacyCompatibilityActions.find((entry) => entry.name === name);
  assert.ok(action, `Expected action ${name} to be registered`);
  return action;
}

describe('legacyCompatibilityActions', () => {
  beforeEach(() => {
    setEnv('STREAM555_BASE_URL', undefined);
    setEnv('STREAM555_AGENT_TOKEN', undefined);
    setEnv('STREAM_API_BEARER_TOKEN', undefined);
    setEnv('STREAM555_DEST_SYNC_ON_GO_LIVE', undefined);
    setEnv('STREAM555_DEST_TWITCH_ENABLED', undefined);
    setEnv('STREAM555_DEST_TWITCH_RTMP_URL', undefined);
    setEnv('STREAM555_DEST_TWITCH_STREAM_KEY', undefined);
  });

  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
    for (const [key, value] of ORIGINAL_ENV.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    ORIGINAL_ENV.clear();
  });

  it(
    'waits for Cloudflare readiness before reporting go-live success',
    { timeout: 10000 },
    async () => {
    setEnv('STREAM555_BASE_URL', 'https://stream.example');
    setEnv('STREAM555_AGENT_TOKEN', 'static-token');
    setEnv('STREAM555_DEST_SYNC_ON_GO_LIVE', 'true');
    setEnv('STREAM555_DEST_TWITCH_ENABLED', 'true');
    setEnv('STREAM555_DEST_TWITCH_RTMP_URL', 'rtmps://twitch.example/app');
    setEnv('STREAM555_DEST_TWITCH_STREAM_KEY', 'twitch-key');

    const updateCalls: Array<Record<string, unknown>> = [];
    const toggleCalls: Array<Record<string, unknown>> = [];
    const stopCalls: string[] = [];
    const service = {
      getCurrentSessionId: () => 'session-1',
      getBoundSessionId: () => 'session-1',
      getConfig: () => ({
        baseUrl: 'https://stream.example',
        agentToken: 'static-token',
        defaultSessionId: 'session-1',
      }),
      updatePlatform: async (
        platformId: string,
        config: Record<string, unknown>,
        sessionId?: string,
      ) => {
        updateCalls.push({ platformId, config, sessionId });
        return { platformId, enabled: true, configured: true };
      },
      togglePlatform: async (platformId: string, enabled: boolean, sessionId?: string) => {
        toggleCalls.push({ platformId, enabled, sessionId });
      },
      stopStream: async (sessionId?: string) => {
        stopCalls.push(sessionId ?? '');
        return { stopped: true, wasActive: true };
      },
    } as unknown as StreamControlService;
    const runtime = {
      getService: (name: string) => (name === 'stream555' ? service : undefined),
    } as IAgentRuntime;

    const requestedUrls: string[] = [];
    const responses = [
      buildJsonResponse(201, { status: 'started', cfSessionId: 'cf-session-1' }),
      buildJsonResponse(200, {
        active: true,
        cfSessionId: 'cf-session-1',
        cloudflare: { isConnected: false, state: 'starting' },
        platforms: { twitch: { enabled: true, status: 'connecting' } },
      }),
      buildJsonResponse(200, {
        active: true,
        cfSessionId: 'cf-session-1',
        cloudflare: { isConnected: true, state: 'live' },
        platforms: { twitch: { enabled: true, status: 'live' } },
      }),
    ];
    globalThis.fetch = (async (input: unknown) => {
      requestedUrls.push(String(input));
      const next = responses.shift();
      assert.ok(next, 'unexpected fetch');
      return next;
    }) as typeof fetch;

    const callbackPayloads: Array<Record<string, unknown>> = [];
    const action = findAction('STREAM555_GO_LIVE');
    const ok = await action.handler(
      runtime,
      {},
      undefined,
      {
        sessionId: 'session-1',
        inputType: 'avatar',
        layoutMode: 'camera-full',
        destinationPlatforms: 'twitch',
      },
      (payload) => {
        callbackPayloads.push(payload as Record<string, unknown>);
      },
    );

    assert.equal(ok, true);
    assert.equal(updateCalls.length, 1);
    assert.ok(
      toggleCalls.some(
        (call) =>
          call.platformId === 'twitch' &&
          call.enabled === true &&
          call.sessionId === 'session-1',
      ),
    );
    assert.ok(
      toggleCalls.some(
        (call) =>
          call.platformId === 'custom' &&
          call.enabled === false &&
          call.sessionId === 'session-1',
      ),
    );
    assert.equal(stopCalls.length, 0);
    assert.match(requestedUrls[0] ?? '', /\/stream\/start$/);
    assert.match(requestedUrls[1] ?? '', /\/stream\/status$/);
    assert.match(requestedUrls[2] ?? '', /\/stream\/status$/);

    const lastPayload = callbackPayloads.at(-1) as {
      text?: string;
      content?: { success?: boolean; data?: Record<string, unknown> };
    };
    assert.equal(lastPayload.content?.success, true);
    assert.equal(lastPayload.content?.data?.cloudflareConnected, true);
    assert.equal(lastPayload.content?.data?.cfSessionId, 'cf-session-1');
    const destinationSync = lastPayload.content?.data?.destinationSync as
      | { applied?: Array<{ platformId?: string; enabled?: boolean }> }
      | undefined;
    assert.ok(
      destinationSync?.applied?.some(
        (entry) => entry.platformId === 'twitch' && entry.enabled === true,
      ),
    );
    assert.ok(
      destinationSync?.applied?.some(
        (entry) => entry.platformId === 'custom' && entry.enabled === false,
      ),
    );
    },
  );

  it(
    'trusts server-reported avatar ready phases from stream/start without a second hard failure gate',
    { timeout: 10000 },
    async () => {
      setEnv('STREAM555_BASE_URL', 'https://stream.example');
      setEnv('STREAM555_AGENT_TOKEN', 'static-token');

      const stopCalls: string[] = [];
      const service = {
        getCurrentSessionId: () => 'session-1',
        getBoundSessionId: () => 'session-1',
        getConfig: () => ({
          baseUrl: 'https://stream.example',
          agentToken: 'static-token',
          defaultSessionId: 'session-1',
        }),
        stopStream: async (sessionId?: string) => {
          stopCalls.push(sessionId ?? '');
          return { stopped: true, wasActive: true };
        },
      } as unknown as StreamControlService;
      const runtime = {
        getService: (name: string) => (name === 'stream555' ? service : undefined),
      } as IAgentRuntime;

      const requestedUrls: string[] = [];
      globalThis.fetch = (async (input: unknown) => {
        requestedUrls.push(String(input));
        return buildJsonResponse(201, {
          status: 'started',
          phase: 'outputs_pending',
          sessionId: 'session-1',
          active: true,
          cfSessionId: 'cf-session-1',
          publisher: 'capture_service_rtmps',
          statusReason: 'ingest connected, waiting for outputs: twitch(pending), kick(pending)',
          requiredOutputsReady: false,
          cloudflare: { isConnected: false, state: 'unknown' },
          platforms: {
            twitch: { enabled: true, status: 'idle' },
            kick: { enabled: true, status: 'idle' },
          },
        });
      }) as typeof fetch;

      const callbackPayloads: Array<Record<string, unknown>> = [];
      const action = findAction('STREAM555_GO_LIVE');
      const ok = await action.handler(
        runtime,
        {},
        undefined,
        {
          sessionId: 'session-1',
          inputType: 'avatar',
          layoutMode: 'camera-full',
        },
        (payload) => {
          callbackPayloads.push(payload as Record<string, unknown>);
        },
      );

      assert.equal(ok, true);
      assert.equal(requestedUrls.length, 1);
      assert.match(requestedUrls[0] ?? '', /\/stream\/start$/);
      assert.equal(stopCalls.length, 0);

      const lastPayload = callbackPayloads.at(-1) as {
        content?: { success?: boolean; data?: Record<string, unknown> };
      };
      assert.equal(lastPayload.content?.success, true);
      assert.equal(lastPayload.content?.data?.phase, 'outputs_pending');
      assert.equal(lastPayload.content?.data?.cfSessionId, 'cf-session-1');
      assert.equal(lastPayload.content?.data?.requiredOutputsReady, false);
      assert.equal(lastPayload.content?.data?.statusReason, 'ingest connected, waiting for outputs: twitch(pending), kick(pending)');
    },
  );

  it(
    'accepts ready avatar phases observed during status polling even if Cloudflare lagged the boolean flag',
    { timeout: 10000 },
    async () => {
      setEnv('STREAM555_BASE_URL', 'https://stream.example');
      setEnv('STREAM555_AGENT_TOKEN', 'static-token');

      const stopCalls: string[] = [];
      const service = {
        getCurrentSessionId: () => 'session-1',
        getBoundSessionId: () => 'session-1',
        getConfig: () => ({
          baseUrl: 'https://stream.example',
          agentToken: 'static-token',
          defaultSessionId: 'session-1',
        }),
        stopStream: async (sessionId?: string) => {
          stopCalls.push(sessionId ?? '');
          return { stopped: true, wasActive: true };
        },
      } as unknown as StreamControlService;
      const runtime = {
        getService: (name: string) => (name === 'stream555' ? service : undefined),
      } as IAgentRuntime;

      const requestedUrls: string[] = [];
      const responses = [
        buildJsonResponse(201, { status: 'started', cfSessionId: 'cf-session-1' }),
        buildJsonResponse(200, {
          sessionId: 'session-1',
          active: true,
          phase: 'outputs_pending',
          cfSessionId: 'cf-session-1',
          publisher: 'capture_service_rtmps',
          statusReason: 'ingest connected, waiting for outputs: twitch(pending)',
          requiredOutputsReady: false,
          cloudflare: { isConnected: false, state: 'unknown' },
          platforms: { twitch: { enabled: true, status: 'idle' } },
        }),
      ];
      globalThis.fetch = (async (input: unknown) => {
        requestedUrls.push(String(input));
        const next = responses.shift();
        assert.ok(next, 'unexpected fetch');
        return next;
      }) as typeof fetch;

      const callbackPayloads: Array<Record<string, unknown>> = [];
      const action = findAction('STREAM555_GO_LIVE');
      const ok = await action.handler(
        runtime,
        {},
        undefined,
        {
          sessionId: 'session-1',
          inputType: 'avatar',
          layoutMode: 'camera-full',
        },
        (payload) => {
          callbackPayloads.push(payload as Record<string, unknown>);
        },
      );

      assert.equal(ok, true);
      assert.equal(stopCalls.length, 0);
      assert.match(requestedUrls[0] ?? '', /\/stream\/start$/);
      assert.match(requestedUrls[1] ?? '', /\/stream\/status$/);

      const lastPayload = callbackPayloads.at(-1) as {
        content?: { success?: boolean; data?: Record<string, unknown> };
      };
      assert.equal(lastPayload.content?.success, true);
      assert.equal(lastPayload.content?.data?.phase, 'outputs_pending');
      assert.equal(lastPayload.content?.data?.requiredOutputsReady, false);
    },
  );

  it(
    'prefers fresh API-key exchange over a stale configured bearer for go-live',
    { timeout: 10000 },
    async () => {
      setEnv('STREAM555_BASE_URL', 'https://stream.example');
      setEnv('STREAM555_AGENT_API_KEY', 'agent-api-key');
      setEnv('STREAM555_AGENT_TOKEN', 'expired-token');

      const service = {
        getCurrentSessionId: () => 'session-1',
        getBoundSessionId: () => 'session-1',
        getConfig: () => ({
          baseUrl: 'https://stream.example',
          agentToken: 'expired-token',
          defaultSessionId: 'session-1',
        }),
      } as unknown as StreamControlService;
      const runtime = {
        getService: (name: string) => (name === 'stream555' ? service : undefined),
      } as IAgentRuntime;

      const requests: Array<{ url: string; auth?: string }> = [];
      globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
        const authHeader =
          init?.headers && !Array.isArray(init.headers)
            ? String((init.headers as Record<string, string>).Authorization ?? '')
            : '';
        requests.push({
          url: String(input),
          auth: authHeader,
        });

        if (String(input).endsWith('/api/agent/v1/auth/token/exchange')) {
          return buildJsonResponse(200, {
            token: 'fresh-token',
            expiresAt: '2099-01-01T00:00:00.000Z',
          });
        }

        if (String(input).endsWith('/stream/start')) {
          return buildJsonResponse(201, { status: 'started', cfSessionId: 'cf-session-1' });
        }

        return buildJsonResponse(200, {
          active: true,
          cfSessionId: 'cf-session-1',
          cloudflare: { isConnected: true, state: 'live' },
          platforms: { twitch: { enabled: true, status: 'live' } },
        });
      }) as typeof fetch;

      const callbackPayloads: Array<Record<string, unknown>> = [];
      const action = findAction('STREAM555_GO_LIVE');
      const ok = await action.handler(
        runtime,
        {},
        undefined,
        {
          sessionId: 'session-1',
          inputType: 'avatar',
          layoutMode: 'camera-full',
        },
        (payload) => {
          callbackPayloads.push(payload as Record<string, unknown>);
        },
      );

      assert.equal(ok, true);
      assert.match(requests[0]?.url ?? '', /\/api\/agent\/v1\/auth\/token\/exchange$/);
      assert.match(requests[1]?.url ?? '', /\/stream\/start$/);
      assert.equal(requests[1]?.auth, 'Bearer fresh-token');
      assert.match(requests[2]?.url ?? '', /\/stream\/status$/);
      assert.equal(requests[2]?.auth, 'Bearer fresh-token');

      const lastPayload = callbackPayloads.at(-1) as {
        content?: { success?: boolean; data?: Record<string, unknown> };
      };
      assert.equal(lastPayload.content?.success, true);
      assert.equal(lastPayload.content?.data?.cloudflareConnected, true);
    },
  );

  it('bootstraps segments through the go-live segments endpoint and treats already-active as success', async () => {
    setEnv('STREAM555_BASE_URL', 'https://stream.example');
    setEnv('STREAM555_AGENT_TOKEN', 'static-token');

    const service = {
      getCurrentSessionId: () => 'session-1',
      getBoundSessionId: () => 'session-1',
      getConfig: () => ({
        baseUrl: 'https://stream.example',
        agentToken: 'static-token',
        defaultSessionId: 'session-1',
      }),
    } as unknown as StreamControlService;
    const runtime = {
      getService: (name: string) => (name === 'stream555' ? service : undefined),
    } as IAgentRuntime;

    const requestedUrls: string[] = [];
    globalThis.fetch = (async (input: unknown) => {
      requestedUrls.push(String(input));
      return buildTextResponse(409, 'Stream already active');
    }) as typeof fetch;

    const callbackPayloads: Array<Record<string, unknown>> = [];
    const action = findAction('STREAM555_GO_LIVE_SEGMENTS');
    const ok = await action.handler(
      runtime,
      {},
      undefined,
      {
        sessionId: 'session-1',
        segmentIntent: 'balanced',
      },
      (payload) => {
        callbackPayloads.push(payload as Record<string, unknown>);
      },
    );

    assert.equal(ok, true);
    assert.equal(requestedUrls.length, 1);
    assert.match(requestedUrls[0] ?? '', /\/api\/agent\/v1\/go-live\/segments$/);
    const lastPayload = callbackPayloads.at(-1) as {
      text?: string;
      content?: { success?: boolean; data?: Record<string, unknown> };
    };
    assert.equal(lastPayload.content?.success, true);
    assert.equal(lastPayload.content?.data?.alreadyActive, true);
  });
});

describe('streamStatusAction', () => {
  it('validates with an initialized service and accepts an explicit session id', async () => {
    const service = {
      isReady: () => false,
      getBoundSessionId: () => null,
      getConfig: () => null,
      getStreamStatus: async (sessionId?: string) => ({
        sessionId: sessionId ?? 'missing',
        active: true,
        cfSessionId: 'cf-session-1',
        cloudflare: { isConnected: true, state: 'live' },
        serverFallbackActive: false,
        platforms: { twitch: { enabled: true, status: 'live' } },
      }),
    } as unknown as StreamControlService;
    const runtime = {
      getService: (name: string) => (name === 'stream555' ? service : undefined),
    } as IAgentRuntime;

    const valid = await streamStatusAction.validate(runtime, {});
    assert.equal(valid, true);

    const callbackPayloads: Array<Record<string, unknown>> = [];
    const ok = await streamStatusAction.handler(
      runtime,
      {},
      undefined,
      { sessionId: 'session-42' },
      (payload) => {
        callbackPayloads.push(payload as Record<string, unknown>);
      },
    );

    assert.equal(ok, true);
    const lastPayload = callbackPayloads.at(-1) as {
      text?: string;
      content?: { success?: boolean; data?: { sessionId?: string } };
    };
    assert.equal(lastPayload.content?.success, true);
    assert.equal(lastPayload.content?.data?.sessionId, 'session-42');
    assert.match(lastPayload.text ?? '', /Cloudflare.*connected/i);
  });

  it('uses the current session when websocket binding is unavailable', async () => {
    const service = {
      isReady: () => false,
      getBoundSessionId: () => null,
      getCurrentSessionId: () => 'session-current',
      getConfig: () => ({
        defaultSessionId: 'default-session',
      }),
      getStreamStatus: async (sessionId?: string) => ({
        sessionId: sessionId ?? 'missing',
        active: true,
        cfSessionId: 'cf-session-1',
        cloudflare: { isConnected: true, state: 'live' },
        serverFallbackActive: false,
        platforms: { twitch: { enabled: true, status: 'live' } },
      }),
    } as unknown as StreamControlService;
    const runtime = {
      getService: (name: string) => (name === 'stream555' ? service : undefined),
    } as IAgentRuntime;

    const callbackPayloads: Array<Record<string, unknown>> = [];
    const ok = await streamStatusAction.handler(
      runtime,
      {},
      undefined,
      {},
      (payload) => {
        callbackPayloads.push(payload as Record<string, unknown>);
      },
    );

    assert.equal(ok, true);
    const lastPayload = callbackPayloads.at(-1) as {
      content?: { success?: boolean; data?: { sessionId?: string } };
    };
    assert.equal(lastPayload.content?.success, true);
    assert.equal(lastPayload.content?.data?.sessionId, 'session-current');
  });
});

describe('streamStopAction', () => {
  it('allows stop when only the current session is available', async () => {
    let stopSessionId: string | undefined;
    const service = {
      isReady: () => false,
      getCurrentSessionId: () => 'session-current',
      getBoundSessionId: () => null,
      getConfig: () => ({
        requireApprovals: false,
      }),
      stopStream: async (sessionId?: string) => {
        stopSessionId = sessionId;
        return { stopped: true, wasActive: true };
      },
    } as unknown as StreamControlService;
    const runtime = {
      getService: (name: string) => (name === 'stream555' ? service : undefined),
    } as IAgentRuntime;

    const valid = await streamStopAction.validate(runtime, {});
    assert.equal(valid, true);

    const callbackPayloads: Array<Record<string, unknown>> = [];
    const ok = await streamStopAction.handler(
      runtime,
      {},
      undefined,
      {},
      (payload) => {
        callbackPayloads.push(payload as Record<string, unknown>);
      },
    );

    assert.equal(ok, true);
    assert.equal(stopSessionId, undefined);
    const lastPayload = callbackPayloads.at(-1) as {
      content?: { success?: boolean; data?: { stopped?: boolean } };
    };
    assert.equal(lastPayload.content?.success, true);
    assert.equal(lastPayload.content?.data?.stopped, true);
  });
});
