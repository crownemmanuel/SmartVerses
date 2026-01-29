// Network Sync Types - for syncing data between SmartVerses instances

import { Playlist, PlaylistItem } from "./index";
import { ScheduleItem } from "./propresenter";

// ============================================================================
// Sync Mode Types
// ============================================================================

export type NetworkSyncMode = "off" | "master" | "slave" | "peer";

// ============================================================================
// Sync Settings
// ============================================================================

export interface NetworkSyncSettings {
  mode: NetworkSyncMode;
  serverPort: number;
  remoteHost: string;
  remotePort: number;
  syncPlaylists: boolean;
  syncSchedule: boolean;
  autoConnect: boolean;
  followMasterTimer: boolean; // When true, run local automations when master starts a session
  apiEnabled: boolean; // Enable HTTP API v1 (Live Slides server)
}

export const DEFAULT_NETWORK_SYNC_SETTINGS: NetworkSyncSettings = {
  mode: "off",
  serverPort: 9877,
  remoteHost: "",
  remotePort: 9877,
  syncPlaylists: true,
  syncSchedule: true,
  autoConnect: false,
  followMasterTimer: false,
  apiEnabled: false,
};

// ============================================================================
// Sync Connection State
// ============================================================================

export interface NetworkSyncConnectionState {
  serverRunning: boolean;
  clientConnected: boolean;
  connectedClients: number;
  lastSyncTime: number | null;
  error: string | null;
}

export const DEFAULT_NETWORK_SYNC_CONNECTION_STATE: NetworkSyncConnectionState = {
  serverRunning: false,
  clientConnected: false,
  connectedClients: 0,
  lastSyncTime: null,
  error: null,
};

// ============================================================================
// WebSocket Message Types
// ============================================================================

// Message types for the sync protocol
export type SyncMessageType =
  | "sync_playlist_item"
  | "sync_playlist_delete"
  | "sync_schedule"
  | "sync_request_state"
  | "sync_full_state"
  | "sync_ack"
  | "sync_error"
  | "sync_join"
  | "sync_welcome";

// Playlist item sync message
export interface SyncPlaylistItemMessage {
  type: "sync_playlist_item";
  playlistId: string;
  item: PlaylistItem;
  action: "create" | "update";
  timestamp: number;
}

// Playlist item delete message
export interface SyncPlaylistDeleteMessage {
  type: "sync_playlist_delete";
  playlistId: string;
  itemId: string;
  timestamp: number;
}

// Schedule sync message
export interface SyncScheduleMessage {
  type: "sync_schedule";
  schedule: ScheduleItem[];
  currentSessionIndex: number | null;
  timestamp: number;
}

// Request full state from master/peer
export interface SyncRequestStateMessage {
  type: "sync_request_state";
  requestPlaylists: boolean;
  requestSchedule: boolean;
}

// Full state sync (response to request or initial sync)
export interface SyncFullStateMessage {
  type: "sync_full_state";
  playlists?: Playlist[];
  schedule?: ScheduleItem[];
  currentSessionIndex?: number | null;
  timestamp: number;
}

// Acknowledgment message
export interface SyncAckMessage {
  type: "sync_ack";
  originalType: SyncMessageType;
  success: boolean;
}

// Error message
export interface SyncErrorMessage {
  type: "sync_error";
  message: string;
}

// Join message (client identifying itself)
export interface SyncJoinMessage {
  type: "sync_join";
  clientMode: string; // "slave" | "peer" - the mode of the connecting client
  clientId: string;
}

// Welcome message (server response to join)
export interface SyncWelcomeMessage {
  type: "sync_welcome";
  serverId: string;
  serverMode: NetworkSyncMode;
  connectedClients: number;
}

// Union type for all sync messages
export type SyncMessage =
  | SyncPlaylistItemMessage
  | SyncPlaylistDeleteMessage
  | SyncScheduleMessage
  | SyncRequestStateMessage
  | SyncFullStateMessage
  | SyncAckMessage
  | SyncErrorMessage
  | SyncJoinMessage
  | SyncWelcomeMessage;

// ============================================================================
// Sync Event Callbacks
// ============================================================================

export interface NetworkSyncCallbacks {
  onPlaylistItemSync?: (playlistId: string, item: PlaylistItem, action: "create" | "update") => void;
  onPlaylistItemDelete?: (playlistId: string, itemId: string) => void;
  onScheduleSync?: (schedule: ScheduleItem[], currentSessionIndex: number | null) => void;
  onFullStateSync?: (playlists: Playlist[] | undefined, schedule: ScheduleItem[] | undefined, currentSessionIndex: number | null | undefined) => void;
  onConnectionStateChange?: (state: NetworkSyncConnectionState) => void;
  onError?: (error: string) => void;
}

// ============================================================================
// Rust Backend Types (matching Tauri commands)
// ============================================================================

export interface SyncServerInfo {
  running: boolean;
  port: number;
  local_ip: string;
  connected_clients: number;
}
