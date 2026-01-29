import { invoke } from "@tauri-apps/api/core";
import {
  LiveSlideSession,
  LiveSlidesState,
  LiveSlidesSettings,
  DEFAULT_LIVE_SLIDES_SETTINGS,
  WsMessage,
  WsTextUpdate,
  WsJoinSession,
  WsSlidesUpdate,
  LiveSlidesProPresenterActivationRule,
} from "../types/liveSlides";

// Storage key for settings
const LIVE_SLIDES_SETTINGS_KEY = "proassist-live-slides-settings";

// ============================================================================
// Settings Management
// ============================================================================

export function loadLiveSlidesSettings(): LiveSlidesSettings {
  try {
    const stored = localStorage.getItem(LIVE_SLIDES_SETTINGS_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as LiveSlidesSettings;
      const merged: LiveSlidesSettings = {
        ...DEFAULT_LIVE_SLIDES_SETTINGS,
        ...parsed,
      };

      // Migration: legacy single `proPresenterActivation` -> rule list with catch-all (lineCount: 0)
      if (
        !merged.proPresenterActivationRules &&
        (merged as any).proPresenterActivation
      ) {
        const legacy = (merged as any).proPresenterActivation as any;
        const migratedRule: LiveSlidesProPresenterActivationRule = {
          id: "legacy",
          lineCount: 0,
          presentationUuid: legacy.presentationUuid,
          slideIndex: legacy.slideIndex,
          presentationName: legacy.presentationName,
          activationClicks: legacy.activationClicks ?? 1,
          takeOffClicks: legacy.takeOffClicks ?? 0,
          clearTextFileOnTakeOff: legacy.clearTextFileOnTakeOff,
        };
        merged.proPresenterActivationRules = [migratedRule];
      }

      // Normalize rules (ensure IDs and click defaults)
      if (merged.proPresenterActivationRules) {
        merged.proPresenterActivationRules = merged.proPresenterActivationRules
          .filter((r: any) => r && typeof r === "object")
          .map((r: any, idx: number) => {
            const id =
              typeof r.id === "string" && r.id.trim().length ? r.id : `rule-${idx}`;
            const lineCountNum =
              typeof r.lineCount === "number" && Number.isFinite(r.lineCount)
                ? Math.max(0, Math.min(6, Math.floor(r.lineCount)))
                : 0;
            return {
              ...r,
              id,
              lineCount: lineCountNum,
              activationClicks: Math.max(1, Number(r.activationClicks ?? 1)),
              takeOffClicks: Math.max(0, Number(r.takeOffClicks ?? 0)),
            } as LiveSlidesProPresenterActivationRule;
          });
      }

      return merged;
    }
  } catch (e) {
    console.error("Failed to load live slides settings:", e);
  }
  return { ...DEFAULT_LIVE_SLIDES_SETTINGS };
}

export function saveLiveSlidesSettings(settings: LiveSlidesSettings): void {
  try {
    const normalized: LiveSlidesSettings = {
      ...settings,
      outputPath: (settings.outputPath || "").trim(),
      outputFilePrefix: (settings.outputFilePrefix || "").trim(),
    };
    localStorage.setItem(LIVE_SLIDES_SETTINGS_KEY, JSON.stringify(normalized));
  } catch (e) {
    console.error("Failed to save live slides settings:", e);
  }
}

// ============================================================================
// Tauri Commands
// ============================================================================

export async function startLiveSlidesServer(port: number): Promise<string> {
  return await invoke<string>("start_live_slides_server", { port });
}

export async function stopLiveSlidesServer(): Promise<void> {
  return await invoke("stop_live_slides_server");
}

export async function createLiveSlideSession(
  name: string
): Promise<LiveSlideSession> {
  return await invoke<LiveSlideSession>("create_live_slide_session", { name });
}

export async function upsertLiveSlideSession(
  sessionId: string,
  name: string,
  rawText: string
): Promise<LiveSlideSession> {
  return await invoke<LiveSlideSession>("upsert_live_slide_session", {
    sessionId,
    name,
    rawText,
  });
}

export async function deleteLiveSlideSession(sessionId: string): Promise<void> {
  return await invoke("delete_live_slide_session", { sessionId });
}

export async function getLiveSlideSessions(): Promise<LiveSlideSession[]> {
  return await invoke<LiveSlideSession[]>("get_live_slide_sessions");
}

export async function getLiveSlidesServerInfo(): Promise<LiveSlidesState> {
  return await invoke<LiveSlidesState>("get_live_slides_server_info");
}

export async function getLocalIp(): Promise<string> {
  return await invoke<string>("get_local_ip");
}

// ============================================================================
// WebSocket Client
// ============================================================================

export type WsMessageHandler = (message: WsMessage) => void;
export type WsConnectionStatus = "connecting" | "connected" | "disconnected" | "error";

export interface WsConnectionUpdate {
  status: WsConnectionStatus;
  code?: number;
  reason?: string;
  error?: unknown;
}

export class LiveSlidesWebSocket {
  private ws: WebSocket | null = null;
  private url: string;
  private sessionId: string;
  private clientType: "notepad" | "viewer";
  private messageHandlers: Set<WsMessageHandler> = new Set();
  private statusHandlers: Set<(status: WsConnectionUpdate) => void> = new Set();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private pendingMessages: WsMessage[] = [];
  private connectPromise: Promise<void> | null = null;
  private intentionalClose = false;

  private emitStatus(update: WsConnectionUpdate): void {
    this.statusHandlers.forEach((handler) => handler(update));
  }

  constructor(
    url: string,
    sessionId: string,
    clientType: "notepad" | "viewer" = "viewer"
  ) {
    this.url = url;
    this.sessionId = sessionId;
    this.clientType = clientType;
  }

  connect(): Promise<void> {
    if (this.connectPromise) return this.connectPromise;

    this.intentionalClose = false;
    this.emitStatus({ status: "connecting" });
    this.connectPromise = new Promise((resolve, reject) => {
      try {
        // Validate URL format
        if (!this.url.startsWith('ws://') && !this.url.startsWith('wss://')) {
          const error = new Error(`Invalid WebSocket URL: ${this.url}`);
          console.error('[WebSocket]', error);
          this.emitStatus({ status: "error", error });
          this.connectPromise = null;
          reject(error);
          return;
        }

        console.log('[WebSocket] Attempting to connect to:', this.url);
        this.ws = new WebSocket(this.url);

        this.ws.onopen = () => {
          console.log('[WebSocket] Connected successfully to', this.url);
          this.reconnectAttempts = 0;
          this.emitStatus({ status: "connected" });

          // Join the session
          const joinMsg: WsJoinSession = {
            type: "join_session",
            session_id: this.sessionId,
            client_type: this.clientType,
          };
          // Send join immediately (WS is open).
          this.ws?.send(JSON.stringify(joinMsg));

          // Flush any queued messages that were attempted before the socket opened.
          if (this.pendingMessages.length) {
            const toSend = [...this.pendingMessages];
            this.pendingMessages = [];
            for (const m of toSend) {
              try {
                this.ws?.send(JSON.stringify(m));
              } catch (e) {
                // If sending fails mid-flush, re-queue remaining and exit.
                this.pendingMessages = [m, ...toSend.slice(toSend.indexOf(m) + 1)];
                break;
              }
            }
          }
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data) as WsMessage;
            this.messageHandlers.forEach((handler) => handler(message));
          } catch (e) {
            console.error('[WebSocket] Failed to parse message:', e, 'Raw data:', event.data);
          }
        };

        this.ws.onerror = (error) => {
          console.error('[WebSocket] Connection error:', error);
          console.error('[WebSocket] Error details:', {
            url: this.url,
            sessionId: this.sessionId,
            clientType: this.clientType,
            readyState: this.ws?.readyState,
            readyStateText: this.ws?.readyState === WebSocket.CONNECTING ? 'CONNECTING' :
                           this.ws?.readyState === WebSocket.OPEN ? 'OPEN' :
                           this.ws?.readyState === WebSocket.CLOSING ? 'CLOSING' :
                           this.ws?.readyState === WebSocket.CLOSED ? 'CLOSED' : 'UNKNOWN',
          });
          this.emitStatus({ status: "error", error });
          this.connectPromise = null;
          reject(error);
        };

        this.ws.onclose = (event) => {
          console.log('[WebSocket] Connection closed:', {
            code: event.code,
            reason: event.reason,
            wasClean: event.wasClean,
            url: this.url,
          });
          this.emitStatus({
            status: "disconnected",
            code: event.code,
            reason: event.reason,
          });
          this.ws = null;
          this.connectPromise = null;
          if (!this.intentionalClose) {
            this.attemptReconnect();
          }
        };
      } catch (e) {
        console.error('[WebSocket] Failed to create WebSocket:', e);
        this.emitStatus({ status: "error", error: e });
        this.connectPromise = null;
        reject(e);
      }
    });

    return this.connectPromise;
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log("Max reconnect attempts reached");
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);

    console.log(`Attempting to reconnect in ${delay}ms...`);
    this.reconnectTimeout = setTimeout(() => {
      this.connect().catch((err) => {
        console.warn("[WebSocket] Reconnection attempt failed:", err);
      });
    }, delay);
  }

  disconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    this.intentionalClose = true;
    this.pendingMessages = [];
    this.connectPromise = null;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  send(message: WsMessage): void {
    // If the socket isn't open yet, queue and try to connect.
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.pendingMessages.push(message);
      if (
        !this.intentionalClose &&
        (!this.ws || this.ws.readyState === WebSocket.CLOSED)
      ) {
        this.connect().catch(() => {
          // Best-effort. Pending messages will flush if/when we reconnect.
        });
      }
      return;
    }
    this.ws.send(JSON.stringify(message));
  }

  sendTextUpdate(text: string): void {
    const msg: WsTextUpdate = {
      type: "text_update",
      session_id: this.sessionId,
      text,
    };
    this.send(msg);
  }

  onMessage(handler: WsMessageHandler): () => void {
    this.messageHandlers.add(handler);
    return () => {
      this.messageHandlers.delete(handler);
    };
  }

  onStatus(handler: (status: WsConnectionUpdate) => void): () => void {
    this.statusHandlers.add(handler);
    return () => {
      this.statusHandlers.delete(handler);
    };
  }

  onSlidesUpdate(
    handler: (update: WsSlidesUpdate) => void
  ): () => void {
    return this.onMessage((message) => {
      if (
        message.type === "slides_update" &&
        message.session_id === this.sessionId
      ) {
        handler(message as WsSlidesUpdate);
      }
    });
  }

  get isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }
}

// ============================================================================
// Fetch from Master (for slave sync backup)
// ============================================================================

export interface MasterSlidesResponse {
  sessions: LiveSlideSession[];
  server_running: boolean;
}

export interface RemoteTranscriptionPinRequest {
  clientId: string;
  label?: string;
}

export interface RemoteTranscriptionPinResponse {
  status: "pinned";
  clientId: string;
  label?: string;
  pinnedAt: number;
}

export interface PinnedTranscriptionClient {
  clientId: string;
  label?: string;
  pinnedAt: number;
}

export interface PinnedTranscriptionListResponse {
  pinned: PinnedTranscriptionClient[];
}

/**
 * Fetch all live slide sessions from a master server via HTTP JSON API.
 * This is a backup sync method when WebSocket sync doesn't work well.
 */
export async function fetchSlidesFromMaster(
  masterHost: string,
  masterPort: number
): Promise<MasterSlidesResponse> {
  const url = `http://${masterHost}:${masterPort}/api/live-slides`;
  
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Accept": "application/json",
      },
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch from master: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    return data as MasterSlidesResponse;
  } catch (error) {
    console.error("[LiveSlides] Failed to fetch from master:", error);
    throw error;
  }
}

export async function pinRemoteTranscriptionSource(
  host: string,
  port: number,
  payload: RemoteTranscriptionPinRequest
): Promise<RemoteTranscriptionPinResponse> {
  const url = `http://${host}:${port}/api/transcription/pin`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `Pin request failed: ${response.status} ${response.statusText}${
          text ? ` - ${text}` : ""
        }`
      );
    }

    const data = await response.json();
    return data as RemoteTranscriptionPinResponse;
  } catch (error) {
    console.error("[LiveSlides] Failed to pin remote transcription:", error);
    throw error;
  }
}

/**
 * Fetch the list of pinned transcription clients from the Live Slides server.
 * Uses the same data that is written by POST /api/transcription/pin.
 */
export async function getPinnedTranscriptionSources(
  host: string,
  port: number
): Promise<PinnedTranscriptionListResponse> {
  const url = `http://${host}:${port}/api/transcription/pin`;

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `Failed to fetch pinned sources: ${response.status} ${response.statusText}${
          text ? ` - ${text}` : ""
        }`
      );
    }

    const data = await response.json();
    return data as PinnedTranscriptionListResponse;
  } catch (error) {
    console.error("[LiveSlides] Failed to fetch pinned transcription sources:", error);
    throw error;
  }
}

// ============================================================================
// URL Generation
// ============================================================================

/**
 * Generate the WebSocket URL for connecting to the Live Slides server.
 * The server now runs HTTP + WebSocket on the same port, with WS at /ws path.
 */
export function generateWebSocketUrl(host: string, port: number): string {
  return `ws://${host}:${port}/ws`;
}

/**
 * Generate a shareable URL that external devices can use to access the notepad.
 * In production, the Rust server serves both static files and WebSocket on the same port.
 */
export function generateShareableNotepadUrl(
  localIp: string,
  serverPort: number,
  sessionId: string
): string {
  // The server handles both HTTP (static files) and WebSocket on the same port
  // WebSocket is available at /ws path
  return `http://${localIp}:${serverPort}/live-slides/notepad/${sessionId}?wsHost=${localIp}&wsPort=${serverPort}`;
}

/**
 * Generate URL for opening notepad locally (within the Tauri app or dev server).
 */
export function generateLocalNotepadUrl(
  localIp: string,
  serverPort: number,
  sessionId: string
): string {
  // Check if we're in development mode (Vite dev server)
  const isDev = window.location.port === "1420" || window.location.hostname === "localhost";
  
  if (isDev) {
    // In dev mode, use the Vite server for the page but connect WS to the Rust server
    const baseUrl = window.location.origin;
    return `${baseUrl}/live-slides/notepad/${sessionId}?wsHost=${localIp}&wsPort=${serverPort}`;
  } else {
    // In production, use the Rust server for everything
    return generateShareableNotepadUrl(localIp, serverPort, sessionId);
  }
}
