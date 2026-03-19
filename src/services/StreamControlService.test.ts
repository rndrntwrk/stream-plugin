import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import { StreamControlService } from './StreamControlService.js';

function buildSession(sessionId: string) {
  return {
    sessionId,
    resumed: false,
    active: false,
    productionState: {
      activeLayout: 'full',
      cameraOn: false,
      screenOn: false,
      micOn: false,
      sources: [],
    },
    platforms: {},
  };
}

describe('StreamControlService session continuity', () => {
  afterEach(() => {
    delete (process.env as Record<string, string | undefined>).STREAM555_DEFAULT_SESSION_ID;
  });

  it('persists the created session and reuses it when websocket bind fails', async () => {
    const service = new StreamControlService() as StreamControlService & {
      httpClient: {
        post: (path: string, body?: Record<string, unknown>) => Promise<{
          success: boolean;
          data?: Record<string, unknown>;
          error?: string;
        }>;
        get: (path: string) => Promise<{
          success: boolean;
          data?: Record<string, unknown>;
          error?: string;
        }>;
      };
      wsClient: {
        getState: () => string;
        connect: () => Promise<void>;
        bind: (sessionId: string) => Promise<void>;
      };
      config: { defaultSessionId?: string } | null;
    };

    const requests: Array<{ method: string; path: string; body?: Record<string, unknown> }> = [];
    service.httpClient = {
      post: async (path: string, body?: Record<string, unknown>) => {
        requests.push({ method: 'POST', path, body });
        if (path === '/api/agent/v1/sessions') {
          return { success: true, data: buildSession('session-1') };
        }
        if (path === '/api/agent/v1/sessions/session-1/stream/stop') {
          return { success: true, data: { stopped: true, wasActive: false } };
        }
        return { success: true, data: { ok: true } };
      },
      get: async (path: string) => {
        requests.push({ method: 'GET', path });
        if (path === '/api/agent/v1/sessions/session-1/stream/status') {
          return {
            success: true,
            data: {
              sessionId: 'session-1',
              active: true,
              cfSessionId: 'cf-session-1',
              cloudflare: { isConnected: true, state: 'connected' },
              platforms: {},
            },
          };
        }
        return { success: true, data: { ok: true } };
      },
    };
    service.wsClient = {
      getState: () => 'connected',
      connect: async () => {},
      bind: async () => {
        throw new Error('bind failed');
      },
    };
    service.config = { defaultSessionId: 'default-session' };

    const session = await service.createOrResumeSession();
    assert.equal(session.sessionId, 'session-1');
    assert.equal(service.getCurrentSessionId(), 'session-1');

    await assert.rejects(() => service.bindWebSocket('session-1'));
    assert.equal(service.getCurrentSessionId(), 'session-1');

    const status = await service.getStreamStatus();
    assert.equal(status.sessionId, 'session-1');

    const stop = await service.stopStream();
    assert.equal(stop.stopped, true);

    assert.deepEqual(
      requests.map((entry) => `${entry.method} ${entry.path}`),
      [
        'POST /api/agent/v1/sessions',
        'GET /api/agent/v1/sessions/session-1/stream/status',
        'POST /api/agent/v1/sessions/session-1/stream/stop',
      ],
    );
  });
});
