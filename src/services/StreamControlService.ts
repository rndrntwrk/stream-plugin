/**
 * StreamControlService
 *
 * Core service for 555stream control. Manages:
 * - HTTP client for Agent API
 * - WebSocket connection for real-time updates
 * - Session state caching
 */

import type { IAgentRuntime, Service } from '../types/index.js';
import { HttpClient } from '../lib/httpClient.js';
import { WsClient } from '../lib/wsClient.js';
import type {
  Stream555Config,
  Session,
  SessionState,
  HealthcheckResult,
  WsServerMessage,
  ProductionState,
  PlatformStatus,
  StreamInput,
  StreamOptions,
  StreamStartResult,
  StreamStopResult,
  StreamStatus,
  FallbackResult,
  StudioState,
  LayoutConfig,
  GraphicConfig,
  Graphic,
  SourceConfig,
  SourceData,
  GuestInvite,
  GuestData,
  UploadResult,
  VideoAsset,
  PlatformConfig,
  UserSettings,
  RadioConfig,
  RadioTrack,
  RadioState,
  Source,
} from '../types/index.js';

export class StreamControlService implements Service {
  static serviceType = 'stream555';

  private runtime: IAgentRuntime | null = null;
  private config: Stream555Config | null = null;
  private httpClient: HttpClient | null = null;
  private wsClient: WsClient | null = null;
  private sessionState: Map<string, SessionState> = new Map();
  private boundSessionId: string | null = null;

  /**
   * Get service type identifier
   */
  get serviceType(): string {
    return StreamControlService.serviceType;
  }

  /**
   * Initialize the service
   */
  async initialize(runtime: IAgentRuntime): Promise<void> {
    this.runtime = runtime;

    // Load configuration from environment
    const baseUrl = process.env.STREAM555_BASE_URL;
    const agentToken = process.env.STREAM555_AGENT_TOKEN;

    if (!baseUrl || !agentToken) {
      throw new Error(
        '[555stream] Missing required configuration. ' +
        'Set STREAM555_BASE_URL and STREAM555_AGENT_TOKEN environment variables.'
      );
    }

    this.config = {
      baseUrl,
      agentToken,
      defaultSessionId: process.env.STREAM555_DEFAULT_SESSION_ID,
      requireApprovals: process.env.STREAM555_REQUIRE_APPROVALS !== 'false',
    };

    // Initialize HTTP client
    this.httpClient = new HttpClient({
      baseUrl: this.config.baseUrl,
      token: this.config.agentToken,
    });

    // Initialize WebSocket client
    const wsUrl = this.config.baseUrl
      .replace(/^http/, 'ws')
      .replace(/\/$/, '') + '/api/agent/v1/ws';

    this.wsClient = new WsClient({
      url: wsUrl,
      token: this.config.agentToken,
    });

    // Set up WebSocket message handlers
    this.setupWsHandlers();

    console.log('[555stream] Service initialized');
  }

  /**
   * Stop the service
   */
  async stop(): Promise<void> {
    if (this.wsClient) {
      this.wsClient.disconnect();
    }
    this.sessionState.clear();
    this.boundSessionId = null;
    console.log('[555stream] Service stopped');
  }

  /**
   * Perform healthcheck against 555stream API
   */
  async healthcheck(): Promise<HealthcheckResult> {
    const result: HealthcheckResult = {
      allPassed: false,
      checks: {
        apiReachable: { passed: false, message: 'Not checked' },
        authValid: { passed: false, message: 'Not checked' },
        wsConnectable: { passed: false, message: 'Not checked' },
      },
    };

    // Check 1: API reachable
    if (this.httpClient) {
      const healthResult = await this.httpClient.healthcheck();
      result.checks.apiReachable = {
        passed: healthResult.reachable,
        message: healthResult.reachable ? 'API is reachable' : (healthResult.error || 'API unreachable'),
        latencyMs: healthResult.latencyMs,
      };
    }

    // Check 2: Auth valid (try to get sessions list)
    if (result.checks.apiReachable.passed && this.httpClient) {
      const start = Date.now();
      const response = await this.httpClient.get('/api/agent/v1/sessions');
      result.checks.authValid = {
        passed: response.success,
        message: response.success ? 'Authentication valid' : (response.error || 'Auth failed'),
        latencyMs: Date.now() - start,
      };
    }

    // Check 3: WebSocket connectable
    if (result.checks.authValid.passed && this.wsClient) {
      try {
        const start = Date.now();
        await this.wsClient.connect();
        result.checks.wsConnectable = {
          passed: true,
          message: 'WebSocket connected',
          latencyMs: Date.now() - start,
        };
      } catch (error) {
        result.checks.wsConnectable = {
          passed: false,
          message: (error as Error).message,
        };
      }
    }

    // Check 4: Session accessible (if default session configured)
    if (result.checks.wsConnectable.passed && this.config?.defaultSessionId && this.wsClient) {
      try {
        const start = Date.now();
        await this.wsClient.bind(this.config.defaultSessionId);
        result.checks.sessionAccessible = {
          passed: true,
          message: `Bound to session ${this.config.defaultSessionId}`,
          latencyMs: Date.now() - start,
        };
        this.boundSessionId = this.config.defaultSessionId;
      } catch (error) {
        result.checks.sessionAccessible = {
          passed: false,
          message: (error as Error).message,
        };
      }
    }

    // Overall pass if all required checks pass
    result.allPassed =
      result.checks.apiReachable.passed &&
      result.checks.authValid.passed &&
      result.checks.wsConnectable.passed;

    return result;
  }

  /**
   * Create or resume a session
   */
  async createOrResumeSession(sessionId?: string): Promise<Session> {
    if (!this.httpClient) {
      throw new Error('[555stream] Service not initialized');
    }

    const response = await this.httpClient.post<Session>(
      '/api/agent/v1/sessions',
      sessionId ? { sessionId } : {}
    );

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to create/resume session');
    }

    // Initialize state cache for this session
    this.initSessionState(response.data);

    return response.data;
  }

  /**
   * Bind WebSocket to a session
   */
  async bindWebSocket(sessionId: string): Promise<void> {
    if (!this.wsClient) {
      throw new Error('[555stream] Service not initialized');
    }

    // Connect if not already connected
    if (this.wsClient.getState() !== 'connected') {
      await this.wsClient.connect();
    }

    // Bind to session
    await this.wsClient.bind(sessionId);
    this.boundSessionId = sessionId;

    console.log(`[555stream] Bound to session ${sessionId}`);
  }

  /**
   * Get cached session state
   */
  getState(sessionId?: string): SessionState | null {
    const id = sessionId || this.boundSessionId;
    if (!id) return null;
    return this.sessionState.get(id) || null;
  }

  /**
   * Get all cached session states
   */
  getAllStates(): Map<string, SessionState> {
    return new Map(this.sessionState);
  }

  /**
   * Get bound session ID
   */
  getBoundSessionId(): string | null {
    return this.boundSessionId;
  }

  /**
   * Check if service is ready (initialized, connected, bound)
   */
  isReady(): boolean {
    return !!(
      this.httpClient &&
      this.wsClient?.isReady() &&
      this.boundSessionId
    );
  }

  /**
   * Get configuration
   */
  getConfig(): Stream555Config | null {
    return this.config;
  }

  /**
   * Patch production state via HTTP
   */
  async patchState(patch: Partial<ProductionState>, sessionId?: string): Promise<ProductionState> {
    if (!this.httpClient) {
      throw new Error('[555stream] Service not initialized');
    }

    const id = sessionId || this.boundSessionId;
    if (!id) {
      throw new Error('[555stream] No session bound');
    }

    const response = await this.httpClient.patch<{ productionState: ProductionState }>(
      `/api/agent/v1/sessions/${id}/state`,
      { patch }
    );

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to patch state');
    }

    return response.data.productionState;
  }

  /**
   * Get session details via HTTP
   */
  async getSession(sessionId?: string): Promise<Session> {
    if (!this.httpClient) {
      throw new Error('[555stream] Service not initialized');
    }

    const id = sessionId || this.boundSessionId;
    if (!id) {
      throw new Error('[555stream] No session specified');
    }

    const response = await this.httpClient.get<Session>(
      `/api/agent/v1/sessions/${id}`
    );

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to get session');
    }

    return response.data;
  }

  // ==========================================
  // Stream Control Methods
  // ==========================================

  /**
   * Start streaming
   */
  async startStream(
    input: StreamInput,
    options?: StreamOptions,
    sources?: Source[],
    sessionId?: string
  ): Promise<StreamStartResult> {
    if (!this.httpClient) {
      throw new Error('[555stream] Service not initialized');
    }

    const id = sessionId || this.boundSessionId;
    if (!id) {
      throw new Error('[555stream] No session bound');
    }

    const response = await this.httpClient.post<StreamStartResult>(
      `/api/agent/v1/sessions/${id}/stream/start`,
      { input, options, sources }
    );

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to start stream');
    }

    return response.data;
  }

  /**
   * Stop streaming
   */
  async stopStream(sessionId?: string): Promise<StreamStopResult> {
    if (!this.httpClient) {
      throw new Error('[555stream] Service not initialized');
    }

    const id = sessionId || this.boundSessionId;
    if (!id) {
      throw new Error('[555stream] No session bound');
    }

    const response = await this.httpClient.post<StreamStopResult>(
      `/api/agent/v1/sessions/${id}/stream/stop`,
      {}
    );

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to stop stream');
    }

    return response.data;
  }

  /**
   * Trigger server-side fallback capture
   */
  async fallbackStream(reason?: string, sessionId?: string): Promise<FallbackResult> {
    if (!this.httpClient) {
      throw new Error('[555stream] Service not initialized');
    }

    const id = sessionId || this.boundSessionId;
    if (!id) {
      throw new Error('[555stream] No session bound');
    }

    const response = await this.httpClient.post<FallbackResult>(
      `/api/agent/v1/sessions/${id}/stream/fallback`,
      { reason }
    );

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to start fallback');
    }

    return response.data;
  }

  /**
   * Get current stream status
   */
  async getStreamStatus(sessionId?: string): Promise<StreamStatus> {
    if (!this.httpClient) {
      throw new Error('[555stream] Service not initialized');
    }

    const id = sessionId || this.boundSessionId;
    if (!id) {
      throw new Error('[555stream] No session bound');
    }

    const response = await this.httpClient.get<StreamStatus>(
      `/api/agent/v1/sessions/${id}/stream/status`
    );

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to get stream status');
    }

    return response.data;
  }

  // ==========================================
  // Studio Methods
  // ==========================================

  /**
   * Get studio state (scenes, layouts, graphics)
   */
  async getStudio(sessionId?: string): Promise<StudioState> {
    if (!this.httpClient) {
      throw new Error('[555stream] Service not initialized');
    }

    const id = sessionId || this.boundSessionId;
    if (!id) {
      throw new Error('[555stream] No session bound');
    }

    const response = await this.httpClient.get<StudioState>(
      `/api/agent/v1/sessions/${id}/studio`
    );

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to get studio state');
    }

    return response.data;
  }

  /**
   * Update layout for a scene
   */
  async setLayout(sceneId: string, layout: LayoutConfig, sessionId?: string): Promise<LayoutConfig> {
    if (!this.httpClient) {
      throw new Error('[555stream] Service not initialized');
    }

    const id = sessionId || this.boundSessionId;
    if (!id) {
      throw new Error('[555stream] No session bound');
    }

    const response = await this.httpClient.put<{ sceneId: string; layout: LayoutConfig }>(
      `/api/agent/v1/sessions/${id}/studio/layout/${sceneId}`,
      layout
    );

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to set layout');
    }

    return response.data.layout;
  }

  /**
   * Set the active scene
   */
  async setActiveScene(sceneId: string, sessionId?: string): Promise<string> {
    if (!this.httpClient) {
      throw new Error('[555stream] Service not initialized');
    }

    const id = sessionId || this.boundSessionId;
    if (!id) {
      throw new Error('[555stream] No session bound');
    }

    const response = await this.httpClient.post<{ activeScene: string }>(
      `/api/agent/v1/sessions/${id}/studio/scene/active`,
      { sceneId }
    );

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to set active scene');
    }

    return response.data.activeScene;
  }

  /**
   * Get all graphics
   */
  async getGraphics(sessionId?: string): Promise<Graphic[]> {
    if (!this.httpClient) {
      throw new Error('[555stream] Service not initialized');
    }

    const id = sessionId || this.boundSessionId;
    if (!id) {
      throw new Error('[555stream] No session bound');
    }

    const response = await this.httpClient.get<{ graphics: Graphic[] }>(
      `/api/agent/v1/sessions/${id}/studio/graphics`
    );

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to get graphics');
    }

    return response.data.graphics;
  }

  /**
   * Create a new graphic
   */
  async createGraphic(graphic: GraphicConfig, sessionId?: string): Promise<Graphic> {
    if (!this.httpClient) {
      throw new Error('[555stream] Service not initialized');
    }

    const id = sessionId || this.boundSessionId;
    if (!id) {
      throw new Error('[555stream] No session bound');
    }

    const response = await this.httpClient.post<{ graphic: Graphic }>(
      `/api/agent/v1/sessions/${id}/studio/graphics`,
      graphic
    );

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to create graphic');
    }

    return response.data.graphic;
  }

  /**
   * Update an existing graphic
   */
  async updateGraphic(
    graphicId: string,
    updates: Partial<GraphicConfig>,
    sessionId?: string
  ): Promise<Graphic> {
    if (!this.httpClient) {
      throw new Error('[555stream] Service not initialized');
    }

    const id = sessionId || this.boundSessionId;
    if (!id) {
      throw new Error('[555stream] No session bound');
    }

    const response = await this.httpClient.put<{ graphic: Graphic }>(
      `/api/agent/v1/sessions/${id}/studio/graphics/${graphicId}`,
      updates
    );

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to update graphic');
    }

    return response.data.graphic;
  }

  /**
   * Delete a graphic
   */
  async deleteGraphic(graphicId: string, sessionId?: string): Promise<void> {
    if (!this.httpClient) {
      throw new Error('[555stream] Service not initialized');
    }

    const id = sessionId || this.boundSessionId;
    if (!id) {
      throw new Error('[555stream] No session bound');
    }

    const response = await this.httpClient.delete(
      `/api/agent/v1/sessions/${id}/studio/graphics/${graphicId}`
    );

    if (!response.success) {
      throw new Error(response.error || 'Failed to delete graphic');
    }
  }

  // ==========================================
  // Source Methods
  // ==========================================

  /**
   * Get all sources for a session
   */
  async getSources(sessionId?: string): Promise<SourceData[]> {
    if (!this.httpClient) {
      throw new Error('[555stream] Service not initialized');
    }

    const id = sessionId || this.boundSessionId;
    if (!id) {
      throw new Error('[555stream] No session bound');
    }

    const response = await this.httpClient.get<{ sources: SourceData[] }>(
      `/api/agent/v1/sessions/${id}/sources`
    );

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to get sources');
    }

    return response.data.sources;
  }

  /**
   * Create a new source
   */
  async createSource(source: SourceConfig, sessionId?: string): Promise<SourceData> {
    if (!this.httpClient) {
      throw new Error('[555stream] Service not initialized');
    }

    const id = sessionId || this.boundSessionId;
    if (!id) {
      throw new Error('[555stream] No session bound');
    }

    const response = await this.httpClient.post<{ source: SourceData }>(
      `/api/agent/v1/sessions/${id}/sources`,
      source
    );

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to create source');
    }

    return response.data.source;
  }

  /**
   * Update a source
   */
  async updateSource(
    sourceId: string,
    updates: Partial<SourceConfig>,
    sessionId?: string
  ): Promise<SourceData> {
    if (!this.httpClient) {
      throw new Error('[555stream] Service not initialized');
    }

    const id = sessionId || this.boundSessionId;
    if (!id) {
      throw new Error('[555stream] No session bound');
    }

    const response = await this.httpClient.patch<{ source: SourceData }>(
      `/api/agent/v1/sessions/${id}/sources/${sourceId}`,
      updates
    );

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to update source');
    }

    return response.data.source;
  }

  /**
   * Delete a source
   */
  async deleteSource(sourceId: string, sessionId?: string): Promise<void> {
    if (!this.httpClient) {
      throw new Error('[555stream] Service not initialized');
    }

    const id = sessionId || this.boundSessionId;
    if (!id) {
      throw new Error('[555stream] No session bound');
    }

    const response = await this.httpClient.delete(
      `/api/agent/v1/sessions/${id}/sources/${sourceId}`
    );

    if (!response.success) {
      throw new Error(response.error || 'Failed to delete source');
    }
  }

  // ==========================================
  // Guest Methods
  // ==========================================

  /**
   * Get all guests for a session
   */
  async getGuests(sessionId?: string): Promise<GuestData[]> {
    if (!this.httpClient) {
      throw new Error('[555stream] Service not initialized');
    }

    const id = sessionId || this.boundSessionId;
    if (!id) {
      throw new Error('[555stream] No session bound');
    }

    const response = await this.httpClient.get<{ guests: GuestData[] }>(
      `/api/agent/v1/sessions/${id}/guests`
    );

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to get guests');
    }

    return response.data.guests;
  }

  /**
   * Create a guest invite
   */
  async createGuestInvite(label?: string, sessionId?: string): Promise<GuestInvite> {
    if (!this.httpClient) {
      throw new Error('[555stream] Service not initialized');
    }

    const id = sessionId || this.boundSessionId;
    if (!id) {
      throw new Error('[555stream] No session bound');
    }

    const response = await this.httpClient.post<GuestInvite>(
      `/api/agent/v1/sessions/${id}/guests/invites`,
      { label }
    );

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to create guest invite');
    }

    return response.data;
  }

  /**
   * Remove/revoke a guest
   */
  async removeGuest(guestId: string, sessionId?: string): Promise<void> {
    if (!this.httpClient) {
      throw new Error('[555stream] Service not initialized');
    }

    const id = sessionId || this.boundSessionId;
    if (!id) {
      throw new Error('[555stream] No session bound');
    }

    const response = await this.httpClient.delete(
      `/api/agent/v1/sessions/${id}/guests/${guestId}`
    );

    if (!response.success) {
      throw new Error(response.error || 'Failed to remove guest');
    }
  }

  // ==========================================
  // Media Methods
  // ==========================================

  /**
   * Upload an image file from URL
   * Note: For file uploads, use multipart form-data directly
   */
  async uploadImageFromUrl(imageUrl: string): Promise<UploadResult> {
    if (!this.httpClient) {
      throw new Error('[555stream] Service not initialized');
    }

    // Fetch the image
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      throw new Error(`Failed to fetch image: ${imageResponse.statusText}`);
    }

    const blob = await imageResponse.blob();
    const filename = imageUrl.split('/').pop() || 'image.jpg';

    // Create form data
    const formData = new FormData();
    formData.append('file', blob, filename);

    const response = await this.httpClient.postFormData<UploadResult>(
      '/api/agent/v1/uploads/image',
      formData
    );

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to upload image');
    }

    return response.data;
  }

  /**
   * Upload a video file from URL
   * Note: For file uploads, use multipart form-data directly
   */
  async uploadVideoFromUrl(videoUrl: string): Promise<UploadResult> {
    if (!this.httpClient) {
      throw new Error('[555stream] Service not initialized');
    }

    // Fetch the video
    const videoResponse = await fetch(videoUrl);
    if (!videoResponse.ok) {
      throw new Error(`Failed to fetch video: ${videoResponse.statusText}`);
    }

    const blob = await videoResponse.blob();
    const filename = videoUrl.split('/').pop() || 'video.mp4';

    // Create form data
    const formData = new FormData();
    formData.append('file', blob, filename);

    const response = await this.httpClient.postFormData<UploadResult>(
      '/api/agent/v1/uploads/video',
      formData
    );

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to upload video');
    }

    return response.data;
  }

  /**
   * Create a video asset from a URL (HLS or direct)
   */
  async addVideoUrl(url: string, name?: string): Promise<VideoAsset> {
    if (!this.httpClient) {
      throw new Error('[555stream] Service not initialized');
    }

    const response = await this.httpClient.post<VideoAsset>(
      '/api/agent/v1/videos/add-url',
      { url, name }
    );

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to add video URL');
    }

    return response.data;
  }

  /**
   * Get video asset details
   */
  async getVideo(videoId: string): Promise<VideoAsset> {
    if (!this.httpClient) {
      throw new Error('[555stream] Service not initialized');
    }

    const response = await this.httpClient.get<VideoAsset>(
      `/api/agent/v1/videos/${videoId}`
    );

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to get video');
    }

    return response.data;
  }

  /**
   * Delete a video asset
   */
  async deleteVideo(videoId: string): Promise<void> {
    if (!this.httpClient) {
      throw new Error('[555stream] Service not initialized');
    }

    const response = await this.httpClient.delete(
      `/api/agent/v1/videos/${videoId}`
    );

    if (!response.success) {
      throw new Error(response.error || 'Failed to delete video');
    }
  }

  /**
   * List all video assets
   */
  async listVideos(limit = 50, offset = 0): Promise<{ videos: VideoAsset[]; total: number }> {
    if (!this.httpClient) {
      throw new Error('[555stream] Service not initialized');
    }

    const response = await this.httpClient.get<{ videos: VideoAsset[]; total: number }>(
      `/api/agent/v1/videos?limit=${limit}&offset=${offset}`
    );

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to list videos');
    }

    return response.data;
  }

  // ==========================================
  // Platform Methods
  // ==========================================

  /**
   * Get user settings (platforms without stream keys)
   */
  async getSettings(): Promise<UserSettings> {
    if (!this.httpClient) {
      throw new Error('[555stream] Service not initialized');
    }

    const response = await this.httpClient.get<UserSettings>(
      '/api/agent/v1/settings'
    );

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to get settings');
    }

    return response.data;
  }

  /**
   * Update platform configuration
   */
  async updatePlatform(
    platformId: string,
    config: PlatformConfig,
    sessionId?: string
  ): Promise<{ platformId: string; rtmpUrl?: string; enabled: boolean; configured: boolean }> {
    if (!this.httpClient) {
      throw new Error('[555stream] Service not initialized');
    }

    const headers: Record<string, string> = {};
    if (sessionId || this.boundSessionId) {
      headers['x-session-id'] = sessionId || this.boundSessionId || '';
    }

    const response = await this.httpClient.put<{
      platformId: string;
      rtmpUrl?: string;
      enabled: boolean;
      configured: boolean;
    }>(
      `/api/agent/v1/platforms/${platformId}`,
      config,
      { headers }
    );

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to update platform');
    }

    return response.data;
  }

  /**
   * Toggle platform enabled state for a session
   */
  async togglePlatform(platformId: string, enabled: boolean, sessionId?: string): Promise<void> {
    if (!this.httpClient) {
      throw new Error('[555stream] Service not initialized');
    }

    const id = sessionId || this.boundSessionId;
    if (!id) {
      throw new Error('[555stream] No session bound');
    }

    const response = await this.httpClient.post(
      `/api/agent/v1/sessions/${id}/platforms/${platformId}/toggle`,
      { enabled }
    );

    if (!response.success) {
      throw new Error(response.error || 'Failed to toggle platform');
    }
  }

  // ==========================================
  // Radio Methods
  // ==========================================

  /**
   * Get available radio tracks
   */
  async getRadioTracks(): Promise<RadioTrack[]> {
    if (!this.httpClient) {
      throw new Error('[555stream] Service not initialized');
    }

    const response = await this.httpClient.get<{ tracks: RadioTrack[] }>(
      '/api/agent/v1/radio/tracks'
    );

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to get radio tracks');
    }

    return response.data.tracks;
  }

  /**
   * Get radio configuration for a session
   */
  async getRadioConfig(sessionId?: string): Promise<RadioState> {
    if (!this.httpClient) {
      throw new Error('[555stream] Service not initialized');
    }

    const id = sessionId || this.boundSessionId;
    if (!id) {
      throw new Error('[555stream] No session bound');
    }

    const response = await this.httpClient.get<RadioState>(
      `/api/agent/v1/radio/${id}`
    );

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to get radio config');
    }

    return response.data;
  }

  /**
   * Create or update radio configuration
   */
  async setRadioConfig(config: RadioConfig, sessionId?: string): Promise<RadioState> {
    if (!this.httpClient) {
      throw new Error('[555stream] Service not initialized');
    }

    const id = sessionId || this.boundSessionId;
    if (!id) {
      throw new Error('[555stream] No session bound');
    }

    const response = await this.httpClient.post<RadioState>(
      `/api/agent/v1/radio/${id}`,
      config
    );

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to set radio config');
    }

    return response.data;
  }

  /**
   * Send a live control command to the radio
   */
  async controlRadio(
    action: 'toggleTrack' | 'toggleEffect' | 'setAutoDJMode' | 'setVolume' | 'setBackground',
    payload: Record<string, unknown>,
    sessionId?: string
  ): Promise<RadioState> {
    if (!this.httpClient) {
      throw new Error('[555stream] Service not initialized');
    }

    const id = sessionId || this.boundSessionId;
    if (!id) {
      throw new Error('[555stream] No session bound');
    }

    const response = await this.httpClient.post<{ success: boolean; state: RadioState }>(
      `/api/agent/v1/radio/${id}/control`,
      { action, payload }
    );

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to control radio');
    }

    return response.data.state;
  }

  // ==========================================
  // Private Methods
  // ==========================================

  private setupWsHandlers(): void {
    if (!this.wsClient) return;

    this.wsClient.onMessage((message) => {
      this.handleWsMessage(message);
    });

    this.wsClient.onStateChange((state) => {
      console.log(`[555stream] WebSocket state: ${state}`);
    });

    this.wsClient.onError((error) => {
      console.error('[555stream] WebSocket error:', error);
    });
  }

  private handleWsMessage(message: WsServerMessage): void {
    switch (message.type) {
      case 'bound':
        this.updateSessionState(message.sessionId, {
          productionState: message.productionState,
          sequence: message.sequence,
        });
        break;

      case 'state_update':
        this.updateSessionState(message.sessionId, {
          productionState: message.productionState,
          sequence: message.sequence,
        });
        break;

      case 'stream_status':
        this.updateSessionState(message.sessionId, {
          active: message.active,
          jobId: message.jobId,
          cfSessionId: message.cfSessionId,
        });
        break;

      case 'platform_status':
        this.updatePlatformStatus(message.sessionId, message.platformId, {
          platformId: message.platformId,
          enabled: message.enabled,
          status: message.status as PlatformStatus['status'],
          error: message.error,
        });
        break;

      case 'stats':
        // Handle both wrapped (message.payload) and unwrapped stats formats
        // Backend wraps stats in a payload object: { type: 'stats', sessionId, payload: { fps, kbps, duration } }
        const statsData = message.payload || message;
        this.updateSessionState(message.sessionId, {
          stats: {
            fps: statsData.fps?.toString(),
            kbps: statsData.kbps?.toString(),
            duration: statsData.duration,
          },
        });
        break;

      case 'error':
        console.error('[555stream] Server error:', message.error);
        break;
    }
  }

  private initSessionState(session: Session): void {
    this.sessionState.set(session.sessionId, {
      sessionId: session.sessionId,
      active: session.active,
      jobId: session.jobId,
      cfSessionId: session.cfSessionId,
      productionState: session.productionState,
      platforms: session.platforms || {},
      sequence: 0,
      lastUpdate: Date.now(),
    });
  }

  private updateSessionState(sessionId: string, updates: Partial<SessionState>): void {
    const current = this.sessionState.get(sessionId);
    if (current) {
      this.sessionState.set(sessionId, {
        ...current,
        ...updates,
        lastUpdate: Date.now(),
      });
    }
  }

  private updatePlatformStatus(sessionId: string, platformId: string, status: PlatformStatus): void {
    const current = this.sessionState.get(sessionId);
    if (current) {
      current.platforms[platformId] = status;
      current.lastUpdate = Date.now();
    }
  }
}
