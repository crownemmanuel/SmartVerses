// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
// (Note) Keep Tauri command wiring in this file; `src-tauri/src/main.rs` delegates to `run()`.
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{broadcast, RwLock};
use futures_util::{SinkExt, StreamExt};
use warp::http::StatusCode;
use warp::Reply;
use warp::Filter;
use warp::ws::{Message as WarpWsMessage, WebSocket};
use rust_embed::RustEmbed;
use cpal::traits::{DeviceTrait, HostTrait};
use cpal::traits::StreamTrait;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use base64::Engine;
use tauri::Emitter;

mod window_commands;
use window_commands::{open_dialog, close_dialog};

// ============================================================================
// Embedded Frontend Assets
// ============================================================================

#[derive(RustEmbed)]
#[folder = "../dist"]
struct FrontendAssets;

// ============================================================================
// Types for Live Slides
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LiveSlideItem {
    pub text: String,
    pub is_sub_item: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LiveSlide {
    pub items: Vec<LiveSlideItem>,
    pub color: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LiveSlideSession {
    pub id: String,
    pub name: String,
    pub slides: Vec<LiveSlide>,
    pub raw_text: String,
    pub created_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LiveSlidesState {
    pub sessions: HashMap<String, LiveSlideSession>,
    pub server_running: bool,
    pub server_port: u16,
    pub local_ip: String,
}

// ============================================================================
// Types for Schedule
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScheduleItem {
    pub id: i32,
    pub session: String,
    pub start_time: String,
    pub end_time: String,
    pub duration: String,
    pub minister: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScheduleState {
    pub schedule: Vec<ScheduleItem>,
    pub current_session_index: Option<usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimerState {
    pub is_running: bool,
    pub time_left: i32, // seconds
    pub session_name: Option<String>,
    pub end_time: Option<String>,
    pub is_overrun: bool,
}

// ============================================================================
// Types for Display (Audience Display)
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DisplayScripture {
    pub verse_text: String,
    pub reference: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DisplayState {
    pub scripture: DisplayScripture,
    pub slides: Vec<String>,
    pub settings: serde_json::Value, // DisplaySettings as JSON
}

// ============================================================================
// Types for HTTP API v1
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiScriptureGoLiveRequest {
    pub reference: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiTimerStartRequest {
    pub seconds: Option<f64>,
    pub minutes: Option<f64>,
}

// ============================================================================
// Types for Network Sync
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncServerInfo {
    pub running: bool,
    pub port: u16,
    pub local_ip: String,
    pub connected_clients: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum SyncMessage {
    #[serde(rename = "sync_playlist_item")]
    PlaylistItem {
        #[serde(rename = "playlistId")]
        playlist_id: String,
        item: serde_json::Value, // PlaylistItem as JSON
        action: String, // "create" | "update"
        timestamp: u64,
    },
    #[serde(rename = "sync_playlist_delete")]
    PlaylistDelete {
        #[serde(rename = "playlistId")]
        playlist_id: String,
        #[serde(rename = "itemId")]
        item_id: String,
        timestamp: u64,
    },
    #[serde(rename = "sync_schedule")]
    Schedule {
        schedule: Vec<ScheduleItem>,
        #[serde(rename = "currentSessionIndex")]
        current_session_index: Option<usize>,
        timestamp: u64,
    },
    #[serde(rename = "sync_request_state")]
    RequestState {
        #[serde(rename = "requestPlaylists")]
        request_playlists: bool,
        #[serde(rename = "requestSchedule")]
        request_schedule: bool,
    },
    #[serde(rename = "sync_full_state")]
    FullState {
        playlists: Option<serde_json::Value>, // Playlist[] as JSON
        schedule: Option<Vec<ScheduleItem>>,
        #[serde(rename = "currentSessionIndex")]
        current_session_index: Option<usize>,
        timestamp: u64,
    },
    #[serde(rename = "sync_join")]
    Join {
        #[serde(rename = "clientMode")]
        client_mode: String,
        #[serde(rename = "clientId")]
        client_id: String,
    },
    #[serde(rename = "sync_welcome")]
    Welcome {
        #[serde(rename = "serverId")]
        server_id: String,
        #[serde(rename = "serverMode")]
        server_mode: String,
        #[serde(rename = "connectedClients")]
        connected_clients: i32,
    },
    #[serde(rename = "sync_error")]
    Error {
        message: String,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum WsMessage {
    // From notepad to server
    #[serde(rename = "text_update")]
    TextUpdate { session_id: String, text: String },
    #[serde(rename = "join_session")]
    JoinSession { session_id: String, client_type: String },
    #[serde(rename = "join_schedule")]
    JoinSchedule,
    
    // From external clients (e.g., browser transcription) to server
    // We keep this flexible because the payload can evolve without requiring
    // strict Rust-side schema updates.
    #[serde(rename = "transcription_stream")]
    TranscriptionStream {
        kind: String,
        timestamp: u64,
        engine: String,
        text: String,
        segment: Option<serde_json::Value>,
        scripture_references: Option<Vec<String>>,
        key_points: Option<serde_json::Value>,
    },
    
    // From server to clients
    #[serde(rename = "slides_update")]
    SlidesUpdate { session_id: String, slides: Vec<LiveSlide>, raw_text: String },
    #[serde(rename = "session_created")]
    SessionCreated { session: LiveSlideSession },
    #[serde(rename = "session_deleted")]
    SessionDeleted { session_id: String },
    #[serde(rename = "schedule_update")]
    ScheduleUpdate { 
        schedule: Vec<ScheduleItem>, 
        #[serde(rename = "currentSessionIndex")]
        current_session_index: Option<usize> 
    },
    #[serde(rename = "timer_update")]
    TimerUpdate { timer_state: TimerState },
    #[serde(rename = "join_timer")]
    JoinTimer,
    #[serde(rename = "join_display")]
    JoinDisplay,
    #[serde(rename = "display_update")]
    DisplayUpdate { 
        scripture: DisplayScripture,
        slides: Vec<String>,
        settings: serde_json::Value,
    },
    #[serde(rename = "error")]
    Error { message: String },
}

// Global state for the WebSocket server
struct ServerState {
    sessions: RwLock<HashMap<String, LiveSlideSession>>,
    schedule: RwLock<ScheduleState>,
    timer_state: RwLock<TimerState>,
    display_state: RwLock<DisplayState>,
    broadcast_tx: broadcast::Sender<String>,
    running: RwLock<bool>,
    port: RwLock<u16>,
    shutdown_tx: RwLock<Option<tokio::sync::oneshot::Sender<()>>>,
    api_enabled: RwLock<bool>,
}

// Global state for the Network Sync server
struct SyncServerState {
    broadcast_tx: broadcast::Sender<String>,
    running: RwLock<bool>,
    port: RwLock<u16>,
    shutdown_tx: RwLock<Option<tokio::sync::oneshot::Sender<()>>>,
    connected_clients: RwLock<i32>,
    server_id: String,
    server_mode: RwLock<String>,
    // Cached state for sending to new clients
    playlists: RwLock<Option<serde_json::Value>>,
    schedule: RwLock<Option<Vec<ScheduleItem>>>,
    current_session_index: RwLock<Option<usize>>,
}

lazy_static::lazy_static! {
    static ref SERVER_STATE: Arc<ServerState> = Arc::new(ServerState {
        sessions: RwLock::new(HashMap::new()),
        schedule: RwLock::new(ScheduleState {
            schedule: Vec::new(),
            current_session_index: None,
        }),
        timer_state: RwLock::new(TimerState {
            is_running: false,
            time_left: 0,
            session_name: None,
            end_time: None,
            is_overrun: false,
        }),
        display_state: RwLock::new(DisplayState {
            scripture: DisplayScripture {
                verse_text: String::new(),
                reference: String::new(),
            },
            slides: Vec::new(),
            settings: serde_json::json!({}),
        }),
        broadcast_tx: broadcast::channel(100).0,
        running: RwLock::new(false),
        port: RwLock::new(9876),
        shutdown_tx: RwLock::new(None),
        api_enabled: RwLock::new(false),
    });
    
    static ref SYNC_SERVER_STATE: Arc<SyncServerState> = Arc::new(SyncServerState {
        broadcast_tx: broadcast::channel(100).0,
        running: RwLock::new(false),
        port: RwLock::new(9877),
        shutdown_tx: RwLock::new(None),
        connected_clients: RwLock::new(0),
        server_id: uuid::Uuid::new_v4().to_string(),
        server_mode: RwLock::new("master".to_string()),
        // Store current state for new clients
        playlists: RwLock::new(None),
        schedule: RwLock::new(None),
        current_session_index: RwLock::new(None),
    });
}

// Slide colors palette
const SLIDE_COLORS: [&str; 8] = [
    "#3B82F6", // Blue
    "#F59E0B", // Yellow/Amber
    "#EC4899", // Pink
    "#10B981", // Green
    "#8B5CF6", // Purple
    "#EF4444", // Red
    "#06B6D4", // Cyan
    "#F97316", // Orange
];

// ============================================================================
// Text Parsing Logic
// ============================================================================

fn parse_notepad_text(text: &str) -> Vec<LiveSlide> {
    let mut slides: Vec<LiveSlide> = Vec::new();
    let mut color_index = 0;
    let lines: Vec<&str> = text.lines().collect();
    let mut i = 0;

    while i < lines.len() {
        let line = lines[i];
        
        // Skip empty lines - they create slide boundaries
        if line.trim().is_empty() {
            i += 1;
            continue;
        }
        
        // Check if this is an orphaned indented line (no parent before it)
        if line.starts_with('\t') || line.starts_with("    ") {
            // Orphaned indented line - treat as regular line
            let trimmed = line
                .trim_start_matches('\t')
                .trim_start_matches("    ")
                .trim_start()
                .to_string();
            if !trimmed.is_empty() {
                slides.push(LiveSlide {
                    items: vec![LiveSlideItem {
                        text: trimmed,
                        is_sub_item: false,
                    }],
                    color: SLIDE_COLORS[color_index % SLIDE_COLORS.len()].to_string(),
                });
                color_index += 1;
            }
            i += 1;
            continue;
        }
        
        // Regular line - check if it has indented children following it
        let parent_text = line.trim().to_string();
        if parent_text.is_empty() {
            i += 1;
            continue;
        }
        
        // Look ahead to see if there are indented lines following
        let mut children: Vec<String> = Vec::new();
        let mut j = i + 1;
        while j < lines.len() {
            let next_line = lines[j];
            if next_line.trim().is_empty() {
                break; // Empty line stops the group
            }
            if next_line.starts_with('\t') || next_line.starts_with("    ") {
                let trimmed = next_line
                    .trim_start_matches('\t')
                    .trim_start_matches("    ")
                    .trim_start()
                    .to_string();
                if !trimmed.is_empty() {
                    children.push(trimmed);
                }
                j += 1;
            } else {
                break; // Non-indented line stops the group
            }
        }
        
        if children.is_empty() {
            // No indented children - collect all consecutive non-indented lines into one slide
            // All items in this slide use the same color (blue - first color)
            let mut current_slide_items: Vec<LiveSlideItem> = Vec::new();
            let mut k = i;
            
            while k < lines.len() {
                let current_line = lines[k];
                
                // Empty line = end of current slide
                if current_line.trim().is_empty() {
                    break;
                }
                
                // If we hit an indented line, stop (that's a different pattern)
                if current_line.starts_with('\t') || current_line.starts_with("    ") {
                    break;
                }
                
                // Regular line = regular item
                let trimmed = current_line.trim().to_string();
                if !trimmed.is_empty() {
                    current_slide_items.push(LiveSlideItem {
                        text: trimmed,
                        is_sub_item: false,
                    });
                }
                k += 1;
            }
            
            if !current_slide_items.is_empty() {
                // Use blue (first color) for consecutive lines on same slide
                slides.push(LiveSlide {
                    items: current_slide_items,
                    color: SLIDE_COLORS[0].to_string(), // Always use blue for consecutive lines
                });
                // Don't increment color_index here - keep it for next slide boundary
            }
            
            i = k;
        } else {
            // Has indented children - use the parent+children pattern
            // First: parent-only slide
            slides.push(LiveSlide {
                items: vec![LiveSlideItem {
                    text: parent_text.clone(),
                    is_sub_item: false,
                }],
                color: SLIDE_COLORS[color_index % SLIDE_COLORS.len()].to_string(),
            });
            color_index += 1;
            
            // Then: one slide per child (parent + child)
            for child in children {
                slides.push(LiveSlide {
                    items: vec![
                        LiveSlideItem {
                            text: parent_text.clone(),
                            is_sub_item: false,
                        },
                        LiveSlideItem {
                            text: child,
                            is_sub_item: true,
                        },
                    ],
                    color: SLIDE_COLORS[color_index % SLIDE_COLORS.len()].to_string(),
                });
                color_index += 1;
            }
            
            i = j; // Move past all processed lines
        }
    }

    slides
}

// ============================================================================
// WebSocket Handler (using warp)
// ============================================================================

async fn handle_ws_connection(ws: WebSocket, state: Arc<ServerState>) {
    let (mut ws_sender, mut ws_receiver) = ws.split();
    let mut broadcast_rx = state.broadcast_tx.subscribe();
    
    // Spawn task to forward broadcasts to this client
    let forward_task = tokio::spawn(async move {
        while let Ok(msg) = broadcast_rx.recv().await {
            if ws_sender.send(WarpWsMessage::text(msg)).await.is_err() {
                break;
            }
        }
    });

    // Handle incoming messages
    while let Some(result) = ws_receiver.next().await {
        if let Ok(msg) = result {
            if let Ok(text) = msg.to_str() {
                if let Ok(ws_msg) = serde_json::from_str::<WsMessage>(text) {
                    match ws_msg {
                        WsMessage::TextUpdate { session_id, text } => {
                            let slides = parse_notepad_text(&text);
                            
                            // Update session
                            {
                                let mut sessions = state.sessions.write().await;
                                if let Some(session) = sessions.get_mut(&session_id) {
                                    session.slides = slides.clone();
                                    session.raw_text = text.clone();
                                }
                            }
                            
                            // Broadcast update to all clients
                            let update = WsMessage::SlidesUpdate {
                                session_id,
                                slides,
                                raw_text: text,
                            };
                            if let Ok(json) = serde_json::to_string(&update) {
                                let _ = state.broadcast_tx.send(json);
                            }
                        }
                        WsMessage::JoinSession { session_id, client_type: _ } => {
                            // Send current session state to the joining client
                            let sessions = state.sessions.read().await;
                            if let Some(session) = sessions.get(&session_id) {
                                let update = WsMessage::SlidesUpdate {
                                    session_id: session_id.clone(),
                                    slides: session.slides.clone(),
                                    raw_text: session.raw_text.clone(),
                                };
                                if let Ok(json) = serde_json::to_string(&update) {
                                    let _ = state.broadcast_tx.send(json);
                                }
                            }
                        }
                        WsMessage::JoinSchedule => {
                            // Send current schedule state to the joining client
                            let schedule_state = state.schedule.read().await;
                            let update = WsMessage::ScheduleUpdate {
                                schedule: schedule_state.schedule.clone(),
                                current_session_index: schedule_state.current_session_index,
                            };
                            if let Ok(json) = serde_json::to_string(&update) {
                                let _ = state.broadcast_tx.send(json);
                            }
                        }
                        WsMessage::JoinTimer => {
                            // Send current timer state to the joining client
                            let timer_state = state.timer_state.read().await;
                            let update = WsMessage::TimerUpdate {
                                timer_state: timer_state.clone(),
                            };
                            if let Ok(json) = serde_json::to_string(&update) {
                                let _ = state.broadcast_tx.send(json);
                            }
                        }
                        WsMessage::JoinDisplay => {
                            // Send current display state to the joining client
                            let display_state = state.display_state.read().await;
                            let update = WsMessage::DisplayUpdate {
                                scripture: display_state.scripture.clone(),
                                slides: display_state.slides.clone(),
                                settings: display_state.settings.clone(),
                            };
                            if let Ok(json) = serde_json::to_string(&update) {
                                let _ = state.broadcast_tx.send(json);
                            }
                        }
                        WsMessage::TranscriptionStream { .. } => {
                            // Re-broadcast browser transcription stream messages to all clients.
                            // We forward the original JSON string so fields remain intact.
                            let _ = state.broadcast_tx.send(text.to_string());
                        }
                        _ => {}
                    }
                }
            }
        }
    }
    
    forward_task.abort();
}

// ============================================================================
// Static File Server (using warp + rust-embed)
// ============================================================================

fn serve_embedded_file(path: &str) -> Option<(Vec<u8>, String)> {
    // Try exact path first
    if let Some(content) = FrontendAssets::get(path) {
        let mime = mime_guess::from_path(path).first_or_octet_stream();
        return Some((content.data.to_vec(), mime.to_string()));
    }

    // In dev, fall back to serving from /public when dist isn't built yet.
    if cfg!(debug_assertions) && !path.contains("..") {
        let public_path = std::path::Path::new("../public").join(path);
        if public_path.exists() {
            if let Ok(data) = std::fs::read(&public_path) {
                let mime = mime_guess::from_path(&public_path).first_or_octet_stream();
                return Some((data, mime.to_string()));
            }
        }
    }
    
    // For SPA routing, return index.html for non-file paths
    if !path.contains('.') || path.ends_with('/') {
        if let Some(content) = FrontendAssets::get("index.html") {
            return Some((content.data.to_vec(), "text/html".to_string()));
        }
    }
    
    None
}

fn json_response(value: serde_json::Value, status: StatusCode) -> warp::reply::Response {
    warp::reply::with_status(warp::reply::json(&value), status).into_response()
}

// ============================================================================
// Combined HTTP + WebSocket Server
// ============================================================================

async fn run_combined_server(port: u16, app: tauri::AppHandle) -> Result<(), String> {
    let state = SERVER_STATE.clone();
    
    // Create shutdown channel
    let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel::<()>();
    *state.shutdown_tx.write().await = Some(shutdown_tx);
    
    // WebSocket route at /ws
    let ws_state = state.clone();
    let ws_route = warp::path("ws")
        .and(warp::ws())
        .map(move |ws: warp::ws::Ws| {
            let state_clone = ws_state.clone();
            ws.on_upgrade(move |socket| handle_ws_connection(socket, state_clone))
        });
    
    // Schedule API route
    let api_state = state.clone();
    let schedule_api_route = warp::path("api")
        .and(warp::path("schedule"))
        .and(warp::path::end())
        .and_then(move || {
            let state_clone = api_state.clone();
            async move {
                let schedule_state = state_clone.schedule.read().await;
                let response = serde_json::json!({
                    "schedule": schedule_state.schedule,
                    "currentSessionIndex": schedule_state.current_session_index,
                });
                Ok::<_, warp::Rejection>(warp::reply::json(&response))
            }
        });
    
    // Live Slides API route - exposes all sessions as JSON for master/slave sync
    let live_slides_api_state = state.clone();
    let live_slides_api_route = warp::path("api")
        .and(warp::path("live-slides"))
        .and(warp::path::end())
        .and_then(move || {
            let state_clone = live_slides_api_state.clone();
            async move {
                let sessions = state_clone.sessions.read().await;
                let session_list: Vec<&LiveSlideSession> = sessions.values().collect();
                let response = serde_json::json!({
                    "sessions": session_list,
                    "server_running": true,
                });
                Ok::<_, warp::Rejection>(warp::reply::json(&response))
            }
        });

    // API v1: Scripture go-live
    let api_app = app.clone();
    let api_scripture_state = state.clone();
    let api_scripture_route = warp::path("api")
        .and(warp::path("v1"))
        .and(warp::path("scripture"))
        .and(warp::path("go-live"))
        .and(warp::path::end())
        .and(warp::post())
        .and(warp::body::json())
        .and_then(move |body: ApiScriptureGoLiveRequest| {
            let state_clone = api_scripture_state.clone();
            let app_clone = api_app.clone();
            async move {
                if !*state_clone.api_enabled.read().await {
                    return Ok::<_, warp::Rejection>(json_response(
                        serde_json::json!({ "error": "api_disabled" }),
                        StatusCode::FORBIDDEN,
                    ));
                }

                let reference = body.reference.trim().to_string();
                if reference.is_empty() {
                    return Ok::<_, warp::Rejection>(json_response(
                        serde_json::json!({ "error": "reference_required" }),
                        StatusCode::BAD_REQUEST,
                    ));
                }

                if let Err(err) = app_clone.emit(
                    "api-scripture-go-live",
                    serde_json::json!({ "reference": reference }),
                ) {
                    return Ok::<_, warp::Rejection>(json_response(
                        serde_json::json!({
                            "error": "emit_failed",
                            "detail": err.to_string()
                        }),
                        StatusCode::INTERNAL_SERVER_ERROR,
                    ));
                }

                Ok::<_, warp::Rejection>(json_response(
                    serde_json::json!({
                        "status": "queued",
                        "reference": reference
                    }),
                    StatusCode::OK,
                ))
            }
        });

    // API v1: Timer start
    let api_timer_state = state.clone();
    let api_timer_app = app.clone();
    let api_timer_route = warp::path("api")
        .and(warp::path("v1"))
        .and(warp::path("timer"))
        .and(warp::path("start"))
        .and(warp::path::end())
        .and(warp::post())
        .and(warp::body::json())
        .and_then(move |body: ApiTimerStartRequest| {
            let state_clone = api_timer_state.clone();
            let app_clone = api_timer_app.clone();
            async move {
                if !*state_clone.api_enabled.read().await {
                    return Ok::<_, warp::Rejection>(json_response(
                        serde_json::json!({ "error": "api_disabled" }),
                        StatusCode::FORBIDDEN,
                    ));
                }

                let raw_seconds = body
                    .seconds
                    .or_else(|| body.minutes.map(|m| m * 60.0))
                    .unwrap_or(0.0);

                if !raw_seconds.is_finite() || raw_seconds <= 0.0 {
                    return Ok::<_, warp::Rejection>(json_response(
                        serde_json::json!({ "error": "seconds_required" }),
                        StatusCode::BAD_REQUEST,
                    ));
                }

                let seconds = raw_seconds.floor() as i64;
                if seconds <= 0 {
                    return Ok::<_, warp::Rejection>(json_response(
                        serde_json::json!({ "error": "seconds_required" }),
                        StatusCode::BAD_REQUEST,
                    ));
                }

                if let Err(err) = app_clone.emit(
                    "api-timer-start",
                    serde_json::json!({ "seconds": seconds }),
                ) {
                    return Ok::<_, warp::Rejection>(json_response(
                        serde_json::json!({
                            "error": "emit_failed",
                            "detail": err.to_string()
                        }),
                        StatusCode::INTERNAL_SERVER_ERROR,
                    ));
                }

                Ok::<_, warp::Rejection>(json_response(
                    serde_json::json!({
                        "status": "queued",
                        "seconds": seconds
                    }),
                    StatusCode::OK,
                ))
            }
        });

    // API docs route - serve api-docs.html
    let api_docs_route = warp::path("api")
        .and(warp::path("docs"))
        .and(warp::path::end())
        .map(|| {
            match serve_embedded_file("api-docs.html") {
                Some((content, _)) => {
                    warp::http::Response::builder()
                        .header("Content-Type", "text/html")
                        .header("Access-Control-Allow-Origin", "*")
                        .body(content)
                        .unwrap()
                }
                None => {
                    warp::http::Response::builder()
                        .status(404)
                        .body(b"API docs not found".to_vec())
                        .unwrap()
                }
            }
        });

    // API OpenAPI spec
    let api_openapi_route = warp::path("api")
        .and(warp::path("openapi.json"))
        .and(warp::path::end())
        .map(|| {
            match serve_embedded_file("api-openapi.json") {
                Some((content, mime)) => {
                    warp::http::Response::builder()
                        .header("Content-Type", mime)
                        .header("Access-Control-Allow-Origin", "*")
                        .body(content)
                        .unwrap()
                }
                None => {
                    warp::http::Response::builder()
                        .status(404)
                        .body(b"OpenAPI spec not found".to_vec())
                        .unwrap()
                }
            }
        });
    
    // Schedule view route - serve schedule-view.html
    let schedule_view_route = warp::path("schedule")
        .and(warp::path("view"))
        .and(warp::path::end())
        .map(|| {
            match serve_embedded_file("schedule-view.html") {
                Some((content, _)) => {
                    warp::http::Response::builder()
                        .header("Content-Type", "text/html")
                        .header("Access-Control-Allow-Origin", "*")
                        .body(content)
                        .unwrap()
                }
                None => {
                    warp::http::Response::builder()
                        .status(404)
                        .body(b"Schedule view not found".to_vec())
                        .unwrap()
                }
            }
        });

    // Live Slides landing page (external browser) - serve live-slides.html
    // This avoids the full React app route (`/live-slides`) which can rely on Tauri APIs.
    let live_slides_landing_route = warp::path("live-slides")
        .and(warp::path::end())
        .map(|| {
            match serve_embedded_file("live-slides.html") {
                Some((content, _)) => {
                    warp::http::Response::builder()
                        .header("Content-Type", "text/html")
                        .header("Access-Control-Allow-Origin", "*")
                        .body(content)
                        .unwrap()
                }
                None => {
                    warp::http::Response::builder()
                        .status(404)
                        .body(b"LiveSlides landing page not found".to_vec())
                        .unwrap()
                }
            }
        });

    // Display route - serve display.html for web audience display
    let display_route = warp::path("display")
        .and(warp::path::end())
        .map(|| {
            match serve_embedded_file("display.html") {
                Some((content, _)) => {
                    warp::http::Response::builder()
                        .header("Content-Type", "text/html")
                        .header("Access-Control-Allow-Origin", "*")
                        .body(content)
                        .unwrap()
                }
                None => {
                    warp::http::Response::builder()
                        .status(404)
                        .body(b"Display page not found".to_vec())
                        .unwrap()
                }
            }
        });
    
    // Static files route - serve embedded frontend assets
    let static_route = warp::path::tail()
        .map(|tail: warp::path::Tail| {
            let path = tail.as_str();
            let path = if path.is_empty() { "index.html" } else { path };
            
            match serve_embedded_file(path) {
                Some((content, mime)) => {
                    warp::http::Response::builder()
                        .header("Content-Type", mime)
                        .header("Access-Control-Allow-Origin", "*")
                        .body(content)
                        .unwrap()
                }
                None => {
                    // SPA fallback - serve index.html for unknown routes
                    if let Some((content, _)) = serve_embedded_file("index.html") {
                        warp::http::Response::builder()
                            .header("Content-Type", "text/html")
                            .header("Access-Control-Allow-Origin", "*")
                            .body(content)
                            .unwrap()
                    } else {
                        warp::http::Response::builder()
                            .status(404)
                            .body(b"Not Found".to_vec())
                            .unwrap()
                    }
                }
            }
        });
    
    // Root path - serve index.html
    let root_route = warp::path::end()
        .map(|| {
            match serve_embedded_file("index.html") {
                Some((content, mime)) => {
                    warp::http::Response::builder()
                        .header("Content-Type", mime)
                        .header("Access-Control-Allow-Origin", "*")
                        .body(content)
                        .unwrap()
                }
                None => {
                    warp::http::Response::builder()
                        .status(404)
                        .body(b"Not Found".to_vec())
                        .unwrap()
                }
            }
        });
    
    // CORS headers for all routes
    let cors = warp::cors()
        .allow_any_origin()
        .allow_methods(vec!["GET", "POST", "OPTIONS"])
        .allow_headers(vec!["Content-Type"]);
    
    // Combine routes: WebSocket first, then APIs, then schedule view, then static files
    let routes = ws_route
        .or(schedule_api_route)
        .or(live_slides_api_route)
        .or(api_scripture_route)
        .or(api_timer_route)
        .or(api_docs_route)
        .or(api_openapi_route)
        .or(schedule_view_route)
        .or(live_slides_landing_route)
        .or(display_route)
        .or(root_route)
        .or(static_route)
        .with(cors);
    
    let addr: std::net::SocketAddr = format!("0.0.0.0:{}", port)
        .parse()
        .map_err(|e| format!("Invalid address: {}", e))?;
    
    println!("Live Slides server (HTTP + WebSocket) listening on {}", addr);
    
    let (_, server) = warp::serve(routes)
        .bind_with_graceful_shutdown(addr, async {
            shutdown_rx.await.ok();
        });
    
    server.await;
    
    Ok(())
}

// ============================================================================
// Network Sync WebSocket Handler
// ============================================================================

async fn handle_sync_ws_connection(ws: WebSocket, state: Arc<SyncServerState>) {
    let (mut ws_sender, mut ws_receiver) = ws.split();
    let mut broadcast_rx = state.broadcast_tx.subscribe();
    
    // Increment connected clients
    {
        let mut count = state.connected_clients.write().await;
        *count += 1;
    }
    
    // Send welcome message
    let connected = *state.connected_clients.read().await;
    let server_mode = state.server_mode.read().await.clone();
    let welcome = SyncMessage::Welcome {
        server_id: state.server_id.clone(),
        server_mode,
        connected_clients: connected,
    };
    if let Ok(json) = serde_json::to_string(&welcome) {
        let _ = ws_sender.send(WarpWsMessage::text(json)).await;
    }
    
    // Spawn task to forward broadcasts to this client
    let forward_task = tokio::spawn(async move {
        while let Ok(msg) = broadcast_rx.recv().await {
            if ws_sender.send(WarpWsMessage::text(msg)).await.is_err() {
                break;
            }
        }
    });

    // Handle incoming messages
    while let Some(result) = ws_receiver.next().await {
        if let Ok(msg) = result {
            if let Ok(text) = msg.to_str() {
                if let Ok(sync_msg) = serde_json::from_str::<SyncMessage>(text) {
                    match sync_msg {
                        SyncMessage::Join { client_mode, client_id } => {
                            println!("Sync client joined: {} (mode: {})", client_id, client_mode);
                            // Send current state to the joining client
                            let playlists = state.playlists.read().await.clone();
                            let schedule = state.schedule.read().await.clone();
                            let current_idx = *state.current_session_index.read().await;
                            
                            let full_state = SyncMessage::FullState {
                                playlists,
                                schedule,
                                current_session_index: current_idx,
                                timestamp: std::time::SystemTime::now()
                                    .duration_since(std::time::UNIX_EPOCH)
                                    .unwrap()
                                    .as_millis() as u64,
                            };
                            if let Ok(json) = serde_json::to_string(&full_state) {
                                let _ = state.broadcast_tx.send(json);
                            }
                        }
                        SyncMessage::RequestState { request_playlists, request_schedule } => {
                            let playlists = if request_playlists {
                                state.playlists.read().await.clone()
                            } else {
                                None
                            };
                            let schedule = if request_schedule {
                                state.schedule.read().await.clone()
                            } else {
                                None
                            };
                            let current_idx = if request_schedule {
                                *state.current_session_index.read().await
                            } else {
                                None
                            };
                            
                            let full_state = SyncMessage::FullState {
                                playlists,
                                schedule,
                                current_session_index: current_idx,
                                timestamp: std::time::SystemTime::now()
                                    .duration_since(std::time::UNIX_EPOCH)
                                    .unwrap()
                                    .as_millis() as u64,
                            };
                            if let Ok(json) = serde_json::to_string(&full_state) {
                                let _ = state.broadcast_tx.send(json);
                            }
                        }
                        // For peer mode - forward incoming sync messages from other peers
                        SyncMessage::PlaylistItem { .. } | 
                        SyncMessage::PlaylistDelete { .. } |
                        SyncMessage::Schedule { .. } |
                        SyncMessage::FullState { .. } => {
                            // Rebroadcast to all connected clients
                            if let Ok(json) = serde_json::to_string(&sync_msg) {
                                let _ = state.broadcast_tx.send(json);
                            }
                        }
                        _ => {}
                    }
                }
            }
        }
    }
    
    // Decrement connected clients on disconnect
    {
        let mut count = state.connected_clients.write().await;
        *count -= 1;
    }
    
    forward_task.abort();
}

async fn run_sync_server(port: u16) -> Result<(), String> {
    let state = SYNC_SERVER_STATE.clone();
    
    // Create shutdown channel
    let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel::<()>();
    *state.shutdown_tx.write().await = Some(shutdown_tx);
    
    // WebSocket route at /sync
    let ws_state = state.clone();
    let ws_route = warp::path("sync")
        .and(warp::ws())
        .map(move |ws: warp::ws::Ws| {
            let state_clone = ws_state.clone();
            ws.on_upgrade(move |socket| handle_sync_ws_connection(socket, state_clone))
        });
    
    // CORS headers
    let cors = warp::cors()
        .allow_any_origin()
        .allow_methods(vec!["GET", "POST", "OPTIONS"])
        .allow_headers(vec!["Content-Type"]);
    
    let routes = ws_route.with(cors);
    
    let addr: std::net::SocketAddr = format!("0.0.0.0:{}", port)
        .parse()
        .map_err(|e| format!("Invalid address: {}", e))?;
    
    println!("Network Sync server listening on {}", addr);
    
    let (_, server) = warp::serve(routes)
        .bind_with_graceful_shutdown(addr, async {
            shutdown_rx.await.ok();
        });
    
    server.await;
    
    Ok(())
}

// ============================================================================
// Tauri Commands
// ============================================================================

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

// Toggle the WebView inspector/devtools.
//
// Note: This requires the `devtools` feature on the `tauri` crate for release builds.
#[tauri::command]
fn toggle_devtools(window: tauri::WebviewWindow) -> Result<(), String> {
    window.open_devtools();
    Ok(())
}

// Safe monitor information structure for serialization
// Note: workArea is not included as it's not available via the Monitor API
// and was causing serialization errors when it was None
#[derive(Debug, Clone, Serialize)]
struct SafeMonitorInfo {
    name: Option<String>,
    position: (i32, i32),
    size: (u32, u32),
    scale_factor: f64,
}

// Get available monitors safely (avoids workArea serialization issues)
#[tauri::command]
fn get_available_monitors_safe(
    window: tauri::WebviewWindow,
) -> Result<Vec<SafeMonitorInfo>, String> {
    match window.available_monitors() {
        Ok(monitors) => {
            let mut safe_monitors = Vec::new();
            for monitor in monitors {
                let pos = monitor.position();
                let size = monitor.size();
                let scale = monitor.scale_factor();
                
                safe_monitors.push(SafeMonitorInfo {
                    name: monitor.name().map(|s| s.clone()),
                    position: (pos.x, pos.y),
                    size: (size.width, size.height),
                    scale_factor: scale,
                });
            }
            Ok(safe_monitors)
        }
        Err(e) => {
            eprintln!("[Display] Failed to get monitors: {:?}", e);
            Err(format!("Failed to get monitors: {:?}", e))
        }
    }
}

// Create or show the audience display window
#[tauri::command]
fn open_audience_display_window(
    app_handle: tauri::AppHandle,
    parent_window: tauri::WebviewWindow,
    monitor_index: Option<usize>,
) -> Result<(), String> {
    use tauri::{Manager, WebviewWindowBuilder};

    const WINDOW_LABEL: &str = "audience-display";

    // Check if window already exists
    if let Some(existing_window) = app_handle.get_webview_window(WINDOW_LABEL) {
        // Window exists, just focus it
        if let Err(e) = existing_window.set_focus() {
            eprintln!("[Display] Error focusing audience display window: {:?}", e);
            return Err(format!("Failed to focus window: {:?}", e));
        }
        return Ok(());
    }

    // Helper to get offset position from parent
    let get_offset_position = || -> (f64, f64, i32, i32) {
        let offset_x = 100.0;
        let offset_y = 100.0;
        match (parent_window.outer_position(), parent_window.outer_size()) {
            (Ok(pos), Ok(size)) => {
                let logical_x = pos.x as f64 + size.width as f64 + offset_x;
                let logical_y = pos.y as f64;
                let physical_x = pos.x + size.width as i32 + offset_x as i32;
                let physical_y = pos.y;
                (logical_x, logical_y, physical_x, physical_y)
            }
            _ => (offset_x, offset_y, offset_x as i32, offset_y as i32)
        }
    };

    // Determine window position and size
    #[allow(unused_variables)]
    let (new_x, new_y, width, height, is_fullscreen, physical_x, physical_y, physical_width, physical_height) = if let Some(index) = monitor_index {
        // Try to find the monitor by index
        match parent_window.available_monitors() {
            Ok(monitors) => {
                if let Some(monitor) = monitors.get(index) {
                    let pos = monitor.position();
                    let size = monitor.size();
                    let scale = monitor.scale_factor();
                    let logical_x = pos.x as f64 / scale;
                    let logical_y = pos.y as f64 / scale;
                    let logical_width = size.width as f64 / scale;
                    let logical_height = size.height as f64 / scale;
                    println!(
                        "[Display] Opening on monitor {}: pos=({},{}), size={}x{}, scale={}",
                        index, pos.x, pos.y, size.width, size.height, scale
                    );
                    (
                        logical_x,
                        logical_y,
                        logical_width,
                        logical_height,
                        true,
                        pos.x,
                        pos.y,
                        size.width,
                        size.height,
                    )
                } else {
                    eprintln!("[Display] Monitor index {} not found, falling back to offset", index);
                    let (x, y, phys_x, phys_y) = get_offset_position();
                    (x, y, 1200.0, 800.0, false, phys_x, phys_y, 1200, 800)
                }
            }
            Err(e) => {
                eprintln!("[Display] Failed to get available monitors: {:?}", e);
                let (x, y, phys_x, phys_y) = get_offset_position();
                (x, y, 1200.0, 800.0, false, phys_x, phys_y, 1200, 800)
            }
        }
    } else {
        let (x, y, phys_x, phys_y) = get_offset_position();
        (x, y, 1200.0, 800.0, false, phys_x, phys_y, 1200, 800)
    };

    let build_window = || {
        let window_builder = WebviewWindowBuilder::new(
            &app_handle,
            WINDOW_LABEL,
            tauri::WebviewUrl::App("/audience-display".into())
        )
            .title("Audience Display")
            .decorations(!is_fullscreen) // No decorations if fullscreen
            .min_inner_size(800.0, 600.0)
            .resizable(true)
            .visible(false) // Start hidden to avoid flickering
            .focused(false); // Don't steal focus from main window

        #[cfg(target_os = "windows")]
        let window_builder = window_builder
            .inner_size(physical_width as f64, physical_height as f64)
            .position(physical_x as f64, physical_y as f64);

        #[cfg(not(target_os = "windows"))]
        let window_builder = window_builder
            .inner_size(width, height)
            .position(new_x, new_y); // Position on selected monitor

        window_builder
    };

    // Try to set parent window (helps with window management on most platforms).
    // On macOS, parenting keeps the window tied to the same Space and makes it
    // move with the parent, which breaks dual-monitor display behavior.
    #[cfg(not(target_os = "macos"))]
    let window_builder = {
        let window_builder = build_window();
        if is_fullscreen {
            window_builder
        } else {
            match window_builder.parent(&parent_window) {
                Ok(builder) => builder,
                Err(e) => {
                    eprintln!("[Display] Warning: Could not set parent window: {:?}", e);
                    // Recreate the builder without parent since parent() consumes it
                    build_window()
                }
            }
        }
    };

    #[cfg(target_os = "macos")]
    let window_builder = build_window();

    match window_builder.build() {
        Ok(window) => {
            if is_fullscreen {
                // On macOS, maximizing can pull the window back to the active Space.
                // We already set position/size to the target monitor, so skip maximize there.
                #[cfg(target_os = "windows")]
                {
                    if let Err(e) = window.set_position(tauri::Position::Logical(tauri::LogicalPosition::new(
                        physical_x as f64,
                        physical_y as f64,
                    ))) {
                        eprintln!("[Display] Failed to set window position: {:?}", e);
                    }
                    if let Err(e) = window.set_size(tauri::Size::Logical(tauri::LogicalSize::new(
                        physical_width as f64,
                        physical_height as f64,
                    ))) {
                        eprintln!("[Display] Failed to set window size: {:?}", e);
                    }
                }
                #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
                {
                    if let Err(e) = window.maximize() {
                        eprintln!("[Display] Failed to maximize window: {:?}", e);
                    }
                }
            }
            if let Err(e) = window.show() {
                eprintln!("[Display] Failed to show window: {:?}", e);
            }
            println!("[Display] Audience display window created successfully");
            Ok(())
        },
        Err(e) => {
            eprintln!("[Display] Error creating audience display window: {:?}", e);
            Err(format!("Failed to create window: {:?}", e))
        }
    }
}

// ============================================================================
// Audience Display Test Window (Fresh Flow)
// ============================================================================






// ============================================================================
// Font Enumeration
// ============================================================================

#[derive(Debug, Clone, Serialize)]
pub struct SystemFont {
    pub family: String,
    pub postscript_name: Option<String>,
}

// Get available system fonts
#[tauri::command]
fn get_available_system_fonts() -> Result<Vec<SystemFont>, String> {
    use fontdb::Database;
    
    let mut db = Database::new();
    db.load_system_fonts();
    
    let mut fonts: Vec<SystemFont> = Vec::new();
    let mut seen_families = std::collections::HashSet::new();
    
    // Iterate through all fonts in the database
    // db.faces() returns an iterator over FaceInfo references
    for face in db.faces() {
        // Get the font family name
        let family = face
            .families
            .first()
            .map(|f| f.0.clone())
            .unwrap_or_else(|| "Unknown".to_string());
        
        // Only add each family once (avoid duplicates)
        if !seen_families.contains(&family) {
            seen_families.insert(family.clone());
            
            fonts.push(SystemFont {
                family: family.clone(),
                postscript_name: Some(face.post_script_name.clone()),
            });
        }
    }
    
    // Sort fonts alphabetically by family name
    fonts.sort_by(|a, b| a.family.to_lowercase().cmp(&b.family.to_lowercase()));
    
    Ok(fonts)
}

// ============================================================================
// Audio Device Enumeration (Native)
// ============================================================================

#[derive(Debug, Clone, Serialize)]
pub struct NativeAudioInputDevice {
    pub id: String,
    pub name: String,
    pub is_default: bool,
}

#[tauri::command]
fn list_native_audio_input_devices() -> Result<Vec<NativeAudioInputDevice>, String> {
    let host = cpal::default_host();
    let default_name = host
        .default_input_device()
        .and_then(|d| d.name().ok());

    let mut devices: Vec<NativeAudioInputDevice> = host
        .input_devices()
        .map_err(|e| format!("input_devices_failed:{}", e))?
        .enumerate()
        .filter_map(|(_idx, d)| {
            let name = d.name().ok()?;
            let is_default = default_name.as_ref().map(|n| n == &name).unwrap_or(false);
            // Use the device name as a stable identifier (index can change between calls)
            Some(NativeAudioInputDevice { id: name.clone(), name, is_default })
        })
        .collect();

    // Put default first, then alphabetical
    devices.sort_by(|a, b| {
        match (a.is_default, b.is_default) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
        }
    });

    Ok(devices)
}

// ============================================================================
// Native Audio Capture -> Frontend Streaming (base64 PCM16LE @ 16kHz mono)
// ============================================================================

#[derive(Debug, Clone, Serialize)]
pub struct NativeAudioChunk {
    pub data_b64: String,
}

lazy_static::lazy_static! {
    static ref NATIVE_AUDIO_RUNNING: AtomicBool = AtomicBool::new(false);
    static ref NATIVE_AUDIO_STOP_FLAG: Mutex<Option<std::sync::Arc<AtomicBool>>> = Mutex::new(None);
}

fn f32_to_i16_sample(x: f32) -> i16 {
    let clamped = x.max(-1.0).min(1.0);
    (clamped * i16::MAX as f32) as i16
}

struct LinearResampler {
    step: f64,
    pos: f64,
    buf: Vec<f32>,
}

impl LinearResampler {
    fn new(in_rate: u32, out_rate: u32) -> Self {
        let step = (in_rate as f64) / (out_rate as f64);
        Self {
            step,
            pos: 0.0,
            buf: Vec::new(),
        }
    }

    fn push_and_resample(&mut self, input: &[f32], output: &mut Vec<f32>) {
        self.buf.extend_from_slice(input);
        // Need at least 2 samples for interpolation
        while (self.pos + 1.0) < (self.buf.len() as f64) {
            let i0 = self.pos.floor() as usize;
            let i1 = i0 + 1;
            let frac = (self.pos - i0 as f64) as f32;
            let s0 = self.buf[i0];
            let s1 = self.buf[i1];
            output.push(s0 + (s1 - s0) * frac);
            self.pos += self.step;
        }

        // Drop consumed samples to keep buffer bounded, preserving fractional position
        let consumed = self.pos.floor() as usize;
        if consumed > 0 {
            if consumed < self.buf.len() {
                self.buf.drain(0..consumed);
            } else {
                // Clear buffer but preserve fractional position for continuity
                self.buf.clear();
            }
            // Always subtract consumed to preserve fractional position
            self.pos -= consumed as f64;
        }
    }
}

#[tauri::command]
fn stop_native_audio_stream() -> Result<(), String> {
    if !NATIVE_AUDIO_RUNNING.load(Ordering::SeqCst) {
        return Ok(());
    }

    if let Ok(mut guard) = NATIVE_AUDIO_STOP_FLAG.lock() {
        if let Some(flag) = guard.take() {
            flag.store(true, Ordering::SeqCst);
        }
    }

    NATIVE_AUDIO_RUNNING.store(false, Ordering::SeqCst);
    Ok(())
}

#[tauri::command]
fn start_native_audio_stream(app: tauri::AppHandle, device_id: Option<String>) -> Result<(), String> {
    // Stop any existing stream first
    let _ = stop_native_audio_stream();

    let host = cpal::default_host();
    let default_device = host
        .default_input_device()
        .ok_or_else(|| "no_default_input_device".to_string())?;

    let mut selected: cpal::Device = default_device;
    if let Some(id) = device_id {
        if let Ok(iter) = host.input_devices() {
            // Prefer matching by device name (stable), fall back to numeric index if provided.
            let mut index_match: Option<cpal::Device> = None;
            let mut name_match: Option<cpal::Device> = None;
            for (idx, dev) in iter.enumerate() {
                if let Ok(name) = dev.name() {
                    if name == id {
                        name_match = Some(dev);
                        break;
                    }
                }
                if index_match.is_none() && id.parse::<usize>().ok() == Some(idx) {
                    index_match = Some(dev);
                }
            }
            if let Some(dev) = name_match.or(index_match) {
                selected = dev;
            }
        }
    }

    let config = selected
        .default_input_config()
        .map_err(|e| format!("default_input_config_failed:{}", e))?;

    let sample_format = config.sample_format();
    let stream_config: cpal::StreamConfig = config.into();
    let in_rate = stream_config.sample_rate.0;
    let channels = stream_config.channels as usize;
    let out_rate: u32 = 16_000;
    let chunk_ms: usize = 250;
    let chunk_samples: usize = (out_rate as usize * chunk_ms) / 1000; // 4000 @ 16kHz

    let stop_flag = std::sync::Arc::new(AtomicBool::new(false));
    if let Ok(mut guard) = NATIVE_AUDIO_STOP_FLAG.lock() {
        *guard = Some(stop_flag.clone());
    }
    NATIVE_AUDIO_RUNNING.store(true, Ordering::SeqCst);

    std::thread::spawn(move || {
        let emit_chunk: std::sync::Arc<dyn Fn(&[i16]) + Send + Sync> = {
            let app_handle = app.clone();
            std::sync::Arc::new(move |samples: &[i16]| {
                let mut bytes: Vec<u8> = Vec::with_capacity(samples.len() * 2);
                for s in samples {
                    bytes.extend_from_slice(&s.to_le_bytes());
                }
                let data_b64 = base64::engine::general_purpose::STANDARD.encode(bytes);
                let _ = app_handle.emit("native_audio_chunk", NativeAudioChunk { data_b64 });
            })
        };

        let stop_flag_loop = stop_flag.clone();

        let build_stream_result = match sample_format {
            cpal::SampleFormat::F32 => {
                let stop_flag = stop_flag.clone();
                let emit_chunk = emit_chunk.clone();
                let mut resampler = LinearResampler::new(in_rate, out_rate);
                let mut out_f32: Vec<f32> = Vec::with_capacity(chunk_samples * 2);
                let mut chunk_i16: Vec<i16> = Vec::with_capacity(chunk_samples * 2);

                selected.build_input_stream(
                    &stream_config,
                    move |data: &[f32], _| {
                        if stop_flag.load(Ordering::SeqCst) {
                            return;
                        }

                        // Downmix to mono f32
                        let mut mono: Vec<f32> = Vec::with_capacity(data.len() / channels.max(1));
                        if channels <= 1 {
                            mono.extend_from_slice(data);
                        } else {
                            for frame in data.chunks(channels) {
                                let sum: f32 = frame.iter().copied().sum();
                                mono.push(sum / channels as f32);
                            }
                        }

                        out_f32.clear();
                        resampler.push_and_resample(&mono, &mut out_f32);
                        for s in &out_f32 {
                            chunk_i16.push(f32_to_i16_sample(*s));
                            if chunk_i16.len() >= chunk_samples {
                                (emit_chunk)(&chunk_i16[..chunk_samples]);
                                chunk_i16.drain(0..chunk_samples);
                            }
                        }
                    },
                    |err| eprintln!("[native_audio] stream error: {}", err),
                    None,
                )
            }
            cpal::SampleFormat::I16 => {
                let stop_flag = stop_flag.clone();
                let emit_chunk = emit_chunk.clone();
                let mut resampler = LinearResampler::new(in_rate, out_rate);
                let mut out_f32: Vec<f32> = Vec::with_capacity(chunk_samples * 2);
                let mut chunk_i16: Vec<i16> = Vec::with_capacity(chunk_samples * 2);

                selected.build_input_stream(
                    &stream_config,
                    move |data: &[i16], _| {
                        if stop_flag.load(Ordering::SeqCst) {
                            return;
                        }

                        let mut mono: Vec<f32> = Vec::with_capacity(data.len() / channels.max(1));
                        if channels <= 1 {
                            mono.extend(data.iter().map(|s| *s as f32 / i16::MAX as f32));
                        } else {
                            for frame in data.chunks(channels) {
                                let sum: f32 = frame
                                    .iter()
                                    .map(|s| *s as f32 / i16::MAX as f32)
                                    .sum();
                                mono.push(sum / channels as f32);
                            }
                        }

                        out_f32.clear();
                        resampler.push_and_resample(&mono, &mut out_f32);
                        for s in &out_f32 {
                            chunk_i16.push(f32_to_i16_sample(*s));
                            if chunk_i16.len() >= chunk_samples {
                                (emit_chunk)(&chunk_i16[..chunk_samples]);
                                chunk_i16.drain(0..chunk_samples);
                            }
                        }
                    },
                    |err| eprintln!("[native_audio] stream error: {}", err),
                    None,
                )
            }
            cpal::SampleFormat::U16 => {
                let stop_flag = stop_flag.clone();
                let emit_chunk = emit_chunk.clone();
                let mut resampler = LinearResampler::new(in_rate, out_rate);
                let mut out_f32: Vec<f32> = Vec::with_capacity(chunk_samples * 2);
                let mut chunk_i16: Vec<i16> = Vec::with_capacity(chunk_samples * 2);

                selected.build_input_stream(
                    &stream_config,
                    move |data: &[u16], _| {
                        if stop_flag.load(Ordering::SeqCst) {
                            return;
                        }

                        let mut mono: Vec<f32> = Vec::with_capacity(data.len() / channels.max(1));
                        if channels <= 1 {
                            mono.extend(
                                data.iter()
                                    .map(|s| (*s as f32 / u16::MAX as f32) * 2.0 - 1.0),
                            );
                        } else {
                            for frame in data.chunks(channels) {
                                let sum: f32 = frame
                                    .iter()
                                    .map(|s| (*s as f32 / u16::MAX as f32) * 2.0 - 1.0)
                                    .sum();
                                mono.push(sum / channels as f32);
                            }
                        }

                        out_f32.clear();
                        resampler.push_and_resample(&mono, &mut out_f32);
                        for s in &out_f32 {
                            chunk_i16.push(f32_to_i16_sample(*s));
                            if chunk_i16.len() >= chunk_samples {
                                (emit_chunk)(&chunk_i16[..chunk_samples]);
                                chunk_i16.drain(0..chunk_samples);
                            }
                        }
                    },
                    |err| eprintln!("[native_audio] stream error: {}", err),
                    None,
                )
            }
            _ => Err(cpal::BuildStreamError::StreamConfigNotSupported),
        };

        let stream = match build_stream_result {
            Ok(s) => s,
            Err(e) => {
                eprintln!("[native_audio] failed to build stream: {}", e);
                NATIVE_AUDIO_RUNNING.store(false, Ordering::SeqCst);
                return;
            }
        };

        if let Err(e) = stream.play() {
            eprintln!("[native_audio] failed to play stream: {}", e);
            NATIVE_AUDIO_RUNNING.store(false, Ordering::SeqCst);
            return;
        }

        while !stop_flag_loop.load(Ordering::SeqCst) {
            std::thread::sleep(std::time::Duration::from_millis(50));
        }

        // dropping stream stops capture
        drop(stream);
        NATIVE_AUDIO_RUNNING.store(false, Ordering::SeqCst);
    });

    Ok(())
}

// ============================================================================
// Native Audio Recording to WAV File (High Quality)
// ============================================================================

#[derive(Debug, Clone, Serialize)]
pub struct RecordingInfo {
    pub file_path: String,
    pub duration_seconds: f64,
    pub sample_rate: u32,
    pub channels: u16,
}

lazy_static::lazy_static! {
    static ref AUDIO_RECORDING_RUNNING: AtomicBool = AtomicBool::new(false);
    static ref AUDIO_RECORDING_STOP_FLAG: Mutex<Option<std::sync::Arc<AtomicBool>>> = Mutex::new(None);
    static ref AUDIO_RECORDING_START_TIME: Mutex<Option<std::time::Instant>> = Mutex::new(None);
    static ref AUDIO_RECORDING_FILE_PATH: Mutex<Option<String>> = Mutex::new(None);
    
    // Video streaming recording state - writes chunks to disk as they arrive
    static ref VIDEO_RECORDING_RUNNING: AtomicBool = AtomicBool::new(false);
    static ref VIDEO_RECORDING_FILE: Mutex<Option<std::fs::File>> = Mutex::new(None);
    static ref VIDEO_RECORDING_FILE_PATH: Mutex<Option<String>> = Mutex::new(None);
    static ref VIDEO_RECORDING_START_TIME: Mutex<Option<std::time::Instant>> = Mutex::new(None);
    static ref VIDEO_RECORDING_BYTES_WRITTEN: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
    
    // Web Audio streaming recording state - writes chunks to disk for crash safety
    // Note: This streams raw WebM/Opus data; MP3 conversion happens after recording stops
    static ref WEB_AUDIO_RECORDING_RUNNING: AtomicBool = AtomicBool::new(false);
    static ref WEB_AUDIO_RECORDING_FILE: Mutex<Option<std::fs::File>> = Mutex::new(None);
    static ref WEB_AUDIO_RECORDING_FILE_PATH: Mutex<Option<String>> = Mutex::new(None);
    static ref WEB_AUDIO_RECORDING_START_TIME: Mutex<Option<std::time::Instant>> = Mutex::new(None);
    static ref WEB_AUDIO_RECORDING_BYTES_WRITTEN: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
}

#[tauri::command]
fn start_native_audio_recording(
    device_id: Option<String>,
    file_path: String,
    sample_rate: Option<u32>,
    warmup_ms: Option<u32>,
) -> Result<(), String> {
    // Stop any existing recording first
    let _ = stop_native_audio_recording();

    // Normalize file path (expand ~)
    let mut normalized_path = file_path.trim().to_string();
    if normalized_path.starts_with("~/") {
        let home = std::env::var("HOME")
            .or_else(|_| std::env::var("USERPROFILE"))
            .map_err(|_| "home_dir_unavailable".to_string())?;
        normalized_path = format!("{}/{}", home.trim_end_matches('/'), &normalized_path[2..]);
    }

    // Create parent directories if needed
    if let Some(parent) = std::path::Path::new(&normalized_path).parent() {
        if !parent.exists() {
            std::fs::create_dir_all(parent).map_err(|e| format!("create_dir_failed:{}", e))?;
        }
    }

    let host = cpal::default_host();
    let default_device = host
        .default_input_device()
        .ok_or_else(|| "no_default_input_device".to_string())?;

    let mut selected: cpal::Device = default_device;
    if let Some(id) = device_id {
        if let Ok(iter) = host.input_devices() {
            for dev in iter {
                if let Ok(name) = dev.name() {
                    if name == id {
                        selected = dev;
                        break;
                    }
                }
            }
        }
    }

    // Get supported config - prefer high sample rate for quality
    let supported_config = selected
        .default_input_config()
        .map_err(|e| format!("default_config_failed:{}", e))?;

    let channels = supported_config.channels();
    let device_sample_rate = supported_config.sample_rate().0;
    let target_sample_rate = sample_rate.unwrap_or(48000).min(device_sample_rate);
    let warmup_ms = warmup_ms.unwrap_or(800) as u64;
    let warmup_frames_device = ((device_sample_rate as u64) * warmup_ms / 1000) as usize;

    // Create WAV writer spec
    let wav_spec = hound::WavSpec {
        // Force mono output to avoid "left-only" playback in some players.
        channels: 1,
        sample_rate: target_sample_rate,
        bits_per_sample: 16,
        sample_format: hound::SampleFormat::Int,
    };

    let wav_writer = hound::WavWriter::create(&normalized_path, wav_spec)
        .map_err(|e| format!("wav_create_failed:{}", e))?;
    let wav_writer = std::sync::Arc::new(Mutex::new(Some(wav_writer)));

    let stop_flag = std::sync::Arc::new(AtomicBool::new(false));
    {
        let mut guard = AUDIO_RECORDING_STOP_FLAG.lock().map_err(|_| "lock_failed")?;
        *guard = Some(stop_flag.clone());
    }
    {
        let mut guard = AUDIO_RECORDING_START_TIME.lock().map_err(|_| "lock_failed")?;
        *guard = Some(std::time::Instant::now());
    }
    {
        let mut guard = AUDIO_RECORDING_FILE_PATH.lock().map_err(|_| "lock_failed")?;
        *guard = Some(normalized_path.clone());
    }

    AUDIO_RECORDING_RUNNING.store(true, Ordering::SeqCst);

    // Spawn recording thread
    let wav_writer_clone = wav_writer.clone();
    let stop_flag_clone = stop_flag.clone();

    std::thread::spawn(move || {
        let stream_config: cpal::StreamConfig = supported_config.clone().into();

        // Simple linear resampler for matching sample rates
        let need_resample = device_sample_rate != target_sample_rate;
        let resample_ratio = target_sample_rate as f64 / device_sample_rate as f64;

        let stream = match supported_config.sample_format() {
            cpal::SampleFormat::F32 => {
                let stop_flag = stop_flag_clone.clone();
                let wav_writer = wav_writer_clone.clone();
                let mut resample_buffer: Vec<f32> = Vec::new();
                let mut resample_pos: f64 = 0.0;
                let mut skipped_frames: usize = 0;
                // Flush counter for crash safety - flush every ~1 second of audio
                let mut samples_since_flush: usize = 0;
                let flush_interval: usize = target_sample_rate as usize; // ~1 second

                selected.build_input_stream(
                    &stream_config,
                    move |data: &[f32], _| {
                        if stop_flag.load(Ordering::SeqCst) {
                            return;
                        }

                        // Discard initial frames to avoid device/AGC ramp-in.
                        let mut start_idx = 0usize;
                        let frames_in = data.len() / channels as usize;
                        if skipped_frames < warmup_frames_device {
                            let remaining = warmup_frames_device - skipped_frames;
                            let to_skip = remaining.min(frames_in);
                            skipped_frames += to_skip;
                            start_idx = to_skip * channels as usize;
                            if start_idx >= data.len() {
                                return;
                            }
                            // reset resampler position after warmup boundary
                            if skipped_frames == warmup_frames_device {
                                resample_pos = 0.0;
                            }
                        }

                        if let Ok(mut guard) = wav_writer.lock() {
                            if let Some(ref mut writer) = *guard {
                                if need_resample {
                                    // Simple linear resampling
                                    resample_buffer.clear();
                                    let data = &data[start_idx..];
                                    let samples_per_channel = data.len() / channels as usize;
                                    while resample_pos < samples_per_channel as f64 {
                                        let idx = resample_pos as usize;
                                        let frac = resample_pos - idx as f64;
                                        // Downmix to mono by averaging channels at each frame
                                        let mut sum = 0.0f32;
                                        for ch in 0..channels as usize {
                                            let pos = idx * channels as usize + ch;
                                            let next_pos = ((idx + 1) * channels as usize + ch).min(data.len() - 1);
                                            let sample = data[pos] * (1.0 - frac as f32) + data[next_pos] * frac as f32;
                                            sum += sample;
                                        }
                                        resample_buffer.push(sum / channels as f32);
                                        resample_pos += 1.0 / resample_ratio;
                                    }
                                    resample_pos -= samples_per_channel as f64;
                                    
                                    for sample in &resample_buffer {
                                        let i16_sample = (*sample * i16::MAX as f32).clamp(i16::MIN as f32, i16::MAX as f32) as i16;
                                        let _ = writer.write_sample(i16_sample);
                                        samples_since_flush += 1;
                                    }
                                } else {
                                    let data = &data[start_idx..];
                                    // Downmix interleaved frames to mono
                                    let mut i = 0usize;
                                    while i + (channels as usize) <= data.len() {
                                        let mut sum = 0.0f32;
                                        for ch in 0..channels as usize {
                                            sum += data[i + ch];
                                        }
                                        let mono = (sum / channels as f32)
                                            .clamp(-1.0, 1.0);
                                        let i16_sample = (mono * i16::MAX as f32).clamp(i16::MIN as f32, i16::MAX as f32) as i16;
                                        let _ = writer.write_sample(i16_sample);
                                        samples_since_flush += 1;
                                        i += channels as usize;
                                    }
                                }

                                // Flush to disk periodically for crash safety
                                // This ensures audio data is on disk even if app crashes
                                if samples_since_flush >= flush_interval {
                                    let _ = writer.flush();
                                    samples_since_flush = 0;
                                }
                            }
                        }
                    },
                    |err| eprintln!("[audio_recording] stream error: {}", err),
                    None,
                )
            }
            cpal::SampleFormat::I16 => {
                let stop_flag = stop_flag_clone.clone();
                let wav_writer = wav_writer_clone.clone();
                let mut skipped_frames: usize = 0;
                // Flush counter for crash safety - flush every ~1 second of audio
                let mut samples_since_flush: usize = 0;
                let flush_interval: usize = target_sample_rate as usize; // ~1 second

                selected.build_input_stream(
                    &stream_config,
                    move |data: &[i16], _| {
                        if stop_flag.load(Ordering::SeqCst) {
                            return;
                        }

                        let mut start_idx = 0usize;
                        let frames_in = data.len() / channels as usize;
                        if skipped_frames < warmup_frames_device {
                            let remaining = warmup_frames_device - skipped_frames;
                            let to_skip = remaining.min(frames_in);
                            skipped_frames += to_skip;
                            start_idx = to_skip * channels as usize;
                            if start_idx >= data.len() {
                                return;
                            }
                        }

                        if let Ok(mut guard) = wav_writer.lock() {
                            if let Some(ref mut writer) = *guard {
                                let data = &data[start_idx..];
                                let mut i = 0usize;
                                while i + (channels as usize) <= data.len() {
                                    let mut sum: i32 = 0;
                                    for ch in 0..channels as usize {
                                        sum += data[i + ch] as i32;
                                    }
                                    let mono = (sum / channels as i32) as i16;
                                    let _ = writer.write_sample(mono);
                                    samples_since_flush += 1;
                                    i += channels as usize;
                                }

                                // Flush to disk periodically for crash safety
                                if samples_since_flush >= flush_interval {
                                    let _ = writer.flush();
                                    samples_since_flush = 0;
                                }
                            }
                        }
                    },
                    |err| eprintln!("[audio_recording] stream error: {}", err),
                    None,
                )
            }
            _ => {
                return;
            }
        };

        let stream = match stream {
            Ok(s) => s,
            Err(e) => {
                eprintln!("[audio_recording] build_stream_failed: {}", e);
                AUDIO_RECORDING_RUNNING.store(false, Ordering::SeqCst);
                return;
            }
        };

        if let Err(e) = stream.play() {
            eprintln!("[audio_recording] play_failed: {}", e);
            AUDIO_RECORDING_RUNNING.store(false, Ordering::SeqCst);
            return;
        }

        // Wait for stop signal
        while !stop_flag_clone.load(Ordering::SeqCst) {
            std::thread::sleep(std::time::Duration::from_millis(50));
        }

        // Finalize WAV file
        drop(stream);
        if let Ok(mut guard) = wav_writer_clone.lock() {
            if let Some(writer) = guard.take() {
                let _ = writer.finalize();
            }
        }

        AUDIO_RECORDING_RUNNING.store(false, Ordering::SeqCst);
    });

    Ok(())
}

#[tauri::command]
fn stop_native_audio_recording() -> Result<RecordingInfo, String> {
    if !AUDIO_RECORDING_RUNNING.load(Ordering::SeqCst) {
        return Err("not_recording".to_string());
    }

    // Get duration
    let duration_seconds = {
        let guard = AUDIO_RECORDING_START_TIME.lock().map_err(|_| "lock_failed")?;
        guard.map(|t| t.elapsed().as_secs_f64()).unwrap_or(0.0)
    };

    // Get file path
    let file_path = {
        let guard = AUDIO_RECORDING_FILE_PATH.lock().map_err(|_| "lock_failed")?;
        guard.clone().unwrap_or_default()
    };

    // Signal stop
    if let Ok(mut guard) = AUDIO_RECORDING_STOP_FLAG.lock() {
        if let Some(flag) = guard.take() {
            flag.store(true, Ordering::SeqCst);
        }
    }

    // Wait a moment for the thread to finalize
    std::thread::sleep(std::time::Duration::from_millis(200));

    AUDIO_RECORDING_RUNNING.store(false, Ordering::SeqCst);

    // Clear stored data
    {
        let mut guard = AUDIO_RECORDING_START_TIME.lock().map_err(|_| "lock_failed")?;
        *guard = None;
    }
    {
        let mut guard = AUDIO_RECORDING_FILE_PATH.lock().map_err(|_| "lock_failed")?;
        *guard = None;
    }

    Ok(RecordingInfo {
        file_path,
        duration_seconds,
        sample_rate: 48000,
        channels: 2,
    })
}

#[tauri::command]
fn is_audio_recording() -> bool {
    AUDIO_RECORDING_RUNNING.load(Ordering::SeqCst)
}

#[tauri::command]
fn get_audio_recording_duration() -> f64 {
    if !AUDIO_RECORDING_RUNNING.load(Ordering::SeqCst) {
        return 0.0;
    }
    if let Ok(guard) = AUDIO_RECORDING_START_TIME.lock() {
        return guard.map(|t| t.elapsed().as_secs_f64()).unwrap_or(0.0);
    }
    0.0
}

// ============================================================================
// Streaming Video Recording (Production-Grade - No Memory Accumulation)
// ============================================================================
//
// This implementation writes video chunks directly to disk as they arrive from
// the frontend MediaRecorder API, avoiding the memory accumulation that causes
// "Out of Memory" crashes during long recordings (1+ hours).
//
// How it works:
// 1. Frontend calls start_streaming_video_recording() to initialize the file
// 2. Each MediaRecorder ondataavailable event sends the chunk via append_video_chunk()
// 3. Chunks are written directly to disk - no accumulation in memory
// 4. Frontend calls finalize_streaming_video_recording() to properly close the file
//
// Memory usage: O(1) constant, regardless of recording length

#[derive(Debug, Clone, Serialize)]
pub struct VideoRecordingInfo {
    pub file_path: String,
    pub duration_seconds: f64,
    pub bytes_written: u64,
}

#[tauri::command]
fn start_streaming_video_recording(file_path: String) -> Result<String, String> {
    use std::fs::{create_dir_all, File};
    use std::path::Path;

    // Stop any existing recording first
    let _ = finalize_streaming_video_recording();

    // Normalize file path (expand ~)
    let mut normalized_path = file_path.trim().to_string();
    if normalized_path.starts_with("~/") {
        let home = std::env::var("HOME")
            .or_else(|_| std::env::var("USERPROFILE"))
            .map_err(|_| "home_dir_unavailable".to_string())?;
        normalized_path = format!("{}/{}", home.trim_end_matches('/'), &normalized_path[2..]);
    }

    // Create parent directories if needed
    if let Some(parent) = Path::new(&normalized_path).parent() {
        if !parent.exists() {
            create_dir_all(parent).map_err(|e| format!("create_dir_failed:{}", e))?;
        }
    }

    // Create/truncate the video file
    let file = File::create(&normalized_path)
        .map_err(|e| format!("create_video_file_failed:{}", e))?;

    // Store state
    {
        let mut guard = VIDEO_RECORDING_FILE.lock().map_err(|_| "lock_failed")?;
        *guard = Some(file);
    }
    {
        let mut guard = VIDEO_RECORDING_FILE_PATH.lock().map_err(|_| "lock_failed")?;
        *guard = Some(normalized_path.clone());
    }
    {
        let mut guard = VIDEO_RECORDING_START_TIME.lock().map_err(|_| "lock_failed")?;
        *guard = Some(std::time::Instant::now());
    }
    VIDEO_RECORDING_BYTES_WRITTEN.store(0, Ordering::SeqCst);
    VIDEO_RECORDING_RUNNING.store(true, Ordering::SeqCst);

    println!("[video_recording] Started streaming recording to: {}", normalized_path);
    Ok(normalized_path)
}

#[tauri::command]
fn append_video_chunk(chunk_base64: String) -> Result<u64, String> {
    use std::io::Write;

    if !VIDEO_RECORDING_RUNNING.load(Ordering::SeqCst) {
        return Err("not_recording".to_string());
    }

    // Decode base64 chunk
    let chunk_data = base64::engine::general_purpose::STANDARD
        .decode(&chunk_base64)
        .map_err(|e| format!("base64_decode_failed:{}", e))?;

    let chunk_size = chunk_data.len() as u64;

    // Write directly to file
    {
        let mut guard = VIDEO_RECORDING_FILE.lock().map_err(|_| "lock_failed")?;
        if let Some(ref mut file) = *guard {
            file.write_all(&chunk_data)
                .map_err(|e| format!("write_chunk_failed:{}", e))?;
            // Flush to ensure data is persisted (optional - can be removed for better performance)
            // file.flush().map_err(|e| format!("flush_failed:{}", e))?;
        } else {
            return Err("file_not_open".to_string());
        }
    }

    // Update bytes written counter
    let total = VIDEO_RECORDING_BYTES_WRITTEN.fetch_add(chunk_size, Ordering::SeqCst) + chunk_size;

    Ok(total)
}

#[tauri::command]
fn finalize_streaming_video_recording() -> Result<VideoRecordingInfo, String> {
    if !VIDEO_RECORDING_RUNNING.load(Ordering::SeqCst) {
        return Err("not_recording".to_string());
    }

    // Get recording info before closing
    let duration_seconds = {
        let guard = VIDEO_RECORDING_START_TIME.lock().map_err(|_| "lock_failed")?;
        guard.map(|t| t.elapsed().as_secs_f64()).unwrap_or(0.0)
    };

    let file_path = {
        let guard = VIDEO_RECORDING_FILE_PATH.lock().map_err(|_| "lock_failed")?;
        guard.clone().unwrap_or_default()
    };

    let bytes_written = VIDEO_RECORDING_BYTES_WRITTEN.load(Ordering::SeqCst);

    // Close the file (drop triggers flush and close)
    {
        let mut guard = VIDEO_RECORDING_FILE.lock().map_err(|_| "lock_failed")?;
        if let Some(file) = guard.take() {
            // Sync all data to disk before closing
            let _ = file.sync_all();
            drop(file);
        }
    }

    // Clear state
    VIDEO_RECORDING_RUNNING.store(false, Ordering::SeqCst);
    {
        let mut guard = VIDEO_RECORDING_FILE_PATH.lock().map_err(|_| "lock_failed")?;
        *guard = None;
    }
    {
        let mut guard = VIDEO_RECORDING_START_TIME.lock().map_err(|_| "lock_failed")?;
        *guard = None;
    }
    VIDEO_RECORDING_BYTES_WRITTEN.store(0, Ordering::SeqCst);

    println!(
        "[video_recording] Finalized: {} ({:.1}s, {} bytes)",
        file_path, duration_seconds, bytes_written
    );

    Ok(VideoRecordingInfo {
        file_path,
        duration_seconds,
        bytes_written,
    })
}

#[tauri::command]
fn is_video_streaming_recording() -> bool {
    VIDEO_RECORDING_RUNNING.load(Ordering::SeqCst)
}

#[tauri::command]
fn get_video_recording_stats() -> Result<VideoRecordingInfo, String> {
    if !VIDEO_RECORDING_RUNNING.load(Ordering::SeqCst) {
        return Err("not_recording".to_string());
    }

    let duration_seconds = {
        let guard = VIDEO_RECORDING_START_TIME.lock().map_err(|_| "lock_failed")?;
        guard.map(|t| t.elapsed().as_secs_f64()).unwrap_or(0.0)
    };

    let file_path = {
        let guard = VIDEO_RECORDING_FILE_PATH.lock().map_err(|_| "lock_failed")?;
        guard.clone().unwrap_or_default()
    };

    let bytes_written = VIDEO_RECORDING_BYTES_WRITTEN.load(Ordering::SeqCst);

    Ok(VideoRecordingInfo {
        file_path,
        duration_seconds,
        bytes_written,
    })
}

#[tauri::command]
fn abort_streaming_video_recording() -> Result<(), String> {
    if !VIDEO_RECORDING_RUNNING.load(Ordering::SeqCst) {
        return Ok(());
    }

    let file_path = {
        let guard = VIDEO_RECORDING_FILE_PATH.lock().map_err(|_| "lock_failed")?;
        guard.clone()
    };

    // Close the file
    {
        let mut guard = VIDEO_RECORDING_FILE.lock().map_err(|_| "lock_failed")?;
        *guard = None;
    }

    // Clear state
    VIDEO_RECORDING_RUNNING.store(false, Ordering::SeqCst);
    {
        let mut guard = VIDEO_RECORDING_FILE_PATH.lock().map_err(|_| "lock_failed")?;
        *guard = None;
    }
    {
        let mut guard = VIDEO_RECORDING_START_TIME.lock().map_err(|_| "lock_failed")?;
        *guard = None;
    }
    VIDEO_RECORDING_BYTES_WRITTEN.store(0, Ordering::SeqCst);

    // Optionally delete the incomplete file
    if let Some(path) = file_path {
        let _ = std::fs::remove_file(&path);
        println!("[video_recording] Aborted and deleted incomplete file: {}", path);
    }

    Ok(())
}

// ============================================================================
// Streaming Web Audio Recording (Production-Grade - Crash Safe)
// ============================================================================
//
// Similar to video streaming, this writes audio chunks directly to disk as they
// arrive from the browser MediaRecorder. The raw format is typically WebM/Opus.
// After recording stops, the frontend converts to MP3 if needed.
//
// Crash Safety: If app crashes, the WebM file on disk contains all audio up to
// that point. It can be recovered or converted manually.

#[derive(Debug, Clone, Serialize)]
pub struct WebAudioRecordingInfo {
    pub file_path: String,
    pub duration_seconds: f64,
    pub bytes_written: u64,
}

#[tauri::command]
fn start_streaming_web_audio_recording(file_path: String) -> Result<String, String> {
    use std::fs::{create_dir_all, File};
    use std::path::Path;

    // Stop any existing recording first
    let _ = finalize_streaming_web_audio_recording();

    // Normalize file path (expand ~)
    let mut normalized_path = file_path.trim().to_string();
    if normalized_path.starts_with("~/") {
        let home = std::env::var("HOME")
            .or_else(|_| std::env::var("USERPROFILE"))
            .map_err(|_| "home_dir_unavailable".to_string())?;
        normalized_path = format!("{}/{}", home.trim_end_matches('/'), &normalized_path[2..]);
    }

    // Create parent directories if needed
    if let Some(parent) = Path::new(&normalized_path).parent() {
        if !parent.exists() {
            create_dir_all(parent).map_err(|e| format!("create_dir_failed:{}", e))?;
        }
    }

    // Create/truncate the audio file
    let file = File::create(&normalized_path)
        .map_err(|e| format!("create_audio_file_failed:{}", e))?;

    // Store state
    {
        let mut guard = WEB_AUDIO_RECORDING_FILE.lock().map_err(|_| "lock_failed")?;
        *guard = Some(file);
    }
    {
        let mut guard = WEB_AUDIO_RECORDING_FILE_PATH.lock().map_err(|_| "lock_failed")?;
        *guard = Some(normalized_path.clone());
    }
    {
        let mut guard = WEB_AUDIO_RECORDING_START_TIME.lock().map_err(|_| "lock_failed")?;
        *guard = Some(std::time::Instant::now());
    }
    WEB_AUDIO_RECORDING_BYTES_WRITTEN.store(0, Ordering::SeqCst);
    WEB_AUDIO_RECORDING_RUNNING.store(true, Ordering::SeqCst);

    println!("[web_audio_recording] Started streaming to: {}", normalized_path);
    Ok(normalized_path)
}

#[tauri::command]
fn append_web_audio_chunk(chunk_base64: String) -> Result<u64, String> {
    use std::io::Write;

    if !WEB_AUDIO_RECORDING_RUNNING.load(Ordering::SeqCst) {
        return Err("not_recording".to_string());
    }

    // Decode base64 chunk
    let chunk_data = base64::engine::general_purpose::STANDARD
        .decode(&chunk_base64)
        .map_err(|e| format!("base64_decode_failed:{}", e))?;

    let chunk_size = chunk_data.len() as u64;

    // Write directly to file
    {
        let mut guard = WEB_AUDIO_RECORDING_FILE.lock().map_err(|_| "lock_failed")?;
        if let Some(ref mut file) = *guard {
            file.write_all(&chunk_data)
                .map_err(|e| format!("write_chunk_failed:{}", e))?;
        } else {
            return Err("file_not_open".to_string());
        }
    }

    // Update bytes written counter
    let total = WEB_AUDIO_RECORDING_BYTES_WRITTEN.fetch_add(chunk_size, Ordering::SeqCst) + chunk_size;

    Ok(total)
}

#[tauri::command]
fn finalize_streaming_web_audio_recording() -> Result<WebAudioRecordingInfo, String> {
    if !WEB_AUDIO_RECORDING_RUNNING.load(Ordering::SeqCst) {
        return Err("not_recording".to_string());
    }

    // Get recording info before closing
    let duration_seconds = {
        let guard = WEB_AUDIO_RECORDING_START_TIME.lock().map_err(|_| "lock_failed")?;
        guard.map(|t| t.elapsed().as_secs_f64()).unwrap_or(0.0)
    };

    let file_path = {
        let guard = WEB_AUDIO_RECORDING_FILE_PATH.lock().map_err(|_| "lock_failed")?;
        guard.clone().unwrap_or_default()
    };

    let bytes_written = WEB_AUDIO_RECORDING_BYTES_WRITTEN.load(Ordering::SeqCst);

    // Close the file (drop triggers flush and close)
    {
        let mut guard = WEB_AUDIO_RECORDING_FILE.lock().map_err(|_| "lock_failed")?;
        if let Some(file) = guard.take() {
            let _ = file.sync_all();
            drop(file);
        }
    }

    // Clear state
    WEB_AUDIO_RECORDING_RUNNING.store(false, Ordering::SeqCst);
    {
        let mut guard = WEB_AUDIO_RECORDING_FILE_PATH.lock().map_err(|_| "lock_failed")?;
        *guard = None;
    }
    {
        let mut guard = WEB_AUDIO_RECORDING_START_TIME.lock().map_err(|_| "lock_failed")?;
        *guard = None;
    }
    WEB_AUDIO_RECORDING_BYTES_WRITTEN.store(0, Ordering::SeqCst);

    println!(
        "[web_audio_recording] Finalized: {} ({:.1}s, {} bytes)",
        file_path, duration_seconds, bytes_written
    );

    Ok(WebAudioRecordingInfo {
        file_path,
        duration_seconds,
        bytes_written,
    })
}

#[tauri::command]
fn is_web_audio_streaming_recording() -> bool {
    WEB_AUDIO_RECORDING_RUNNING.load(Ordering::SeqCst)
}

#[tauri::command]
fn get_web_audio_recording_stats() -> Result<WebAudioRecordingInfo, String> {
    if !WEB_AUDIO_RECORDING_RUNNING.load(Ordering::SeqCst) {
        return Err("not_recording".to_string());
    }

    let duration_seconds = {
        let guard = WEB_AUDIO_RECORDING_START_TIME.lock().map_err(|_| "lock_failed")?;
        guard.map(|t| t.elapsed().as_secs_f64()).unwrap_or(0.0)
    };

    let file_path = {
        let guard = WEB_AUDIO_RECORDING_FILE_PATH.lock().map_err(|_| "lock_failed")?;
        guard.clone().unwrap_or_default()
    };

    let bytes_written = WEB_AUDIO_RECORDING_BYTES_WRITTEN.load(Ordering::SeqCst);

    Ok(WebAudioRecordingInfo {
        file_path,
        duration_seconds,
        bytes_written,
    })
}

#[tauri::command]
fn abort_streaming_web_audio_recording() -> Result<(), String> {
    if !WEB_AUDIO_RECORDING_RUNNING.load(Ordering::SeqCst) {
        return Ok(());
    }

    let file_path = {
        let guard = WEB_AUDIO_RECORDING_FILE_PATH.lock().map_err(|_| "lock_failed")?;
        guard.clone()
    };

    // Close the file
    {
        let mut guard = WEB_AUDIO_RECORDING_FILE.lock().map_err(|_| "lock_failed")?;
        *guard = None;
    }

    // Clear state
    WEB_AUDIO_RECORDING_RUNNING.store(false, Ordering::SeqCst);
    {
        let mut guard = WEB_AUDIO_RECORDING_FILE_PATH.lock().map_err(|_| "lock_failed")?;
        *guard = None;
    }
    {
        let mut guard = WEB_AUDIO_RECORDING_START_TIME.lock().map_err(|_| "lock_failed")?;
        *guard = None;
    }
    WEB_AUDIO_RECORDING_BYTES_WRITTEN.store(0, Ordering::SeqCst);

    // Optionally delete the incomplete file
    if let Some(path) = file_path {
        let _ = std::fs::remove_file(&path);
        println!("[web_audio_recording] Aborted and deleted: {}", path);
    }

    Ok(())
}

/// Read a file and return its contents as base64.
/// Used to read the streamed WebM audio file for MP3 conversion.
#[tauri::command]
fn read_file_as_base64(file_path: String) -> Result<String, String> {
    use std::fs::File;
    use std::io::Read;
    use std::path::Path;

    // Normalize file path (expand ~)
    let mut normalized_path = file_path.trim().to_string();
    if normalized_path.starts_with("~/") {
        let home = std::env::var("HOME")
            .or_else(|_| std::env::var("USERPROFILE"))
            .map_err(|_| "home_dir_unavailable".to_string())?;
        normalized_path = format!("{}/{}", home.trim_end_matches('/'), &normalized_path[2..]);
    }

    if !Path::new(&normalized_path).exists() {
        return Err(format!("file_not_found:{}", normalized_path));
    }

    let mut file = File::open(&normalized_path)
        .map_err(|e| format!("open_failed:{}", e))?;
    
    let mut buffer = Vec::new();
    file.read_to_end(&mut buffer)
        .map_err(|e| format!("read_failed:{}", e))?;

    Ok(base64::engine::general_purpose::STANDARD.encode(&buffer))
}

/// Delete a file (used to clean up temp WebM files after MP3 conversion)
#[tauri::command]
fn delete_file(file_path: String) -> Result<(), String> {
    // Normalize file path (expand ~)
    let mut normalized_path = file_path.trim().to_string();
    if normalized_path.starts_with("~/") {
        let home = std::env::var("HOME")
            .or_else(|_| std::env::var("USERPROFILE"))
            .map_err(|_| "home_dir_unavailable".to_string())?;
        normalized_path = format!("{}/{}", home.trim_end_matches('/'), &normalized_path[2..]);
    }

    std::fs::remove_file(&normalized_path)
        .map_err(|e| format!("delete_failed:{}", e))?;

    println!("[file] Deleted: {}", normalized_path);
    Ok(())
}

// ============================================================================
// AssemblyAI Token Generation (Tauri Backend) - Universal Streaming v3
// ============================================================================

#[derive(Debug, Deserialize)]
struct AssemblyAiTokenResponse {
    token: String,
}

/// Generate a temporary token for AssemblyAI Universal Streaming (v3).
/// 
/// The v3 API uses GET https://streaming.assemblyai.com/v3/token with query params.
/// Maximum expires_in_seconds is 600 (10 minutes).
#[tauri::command]
async fn assemblyai_create_streaming_token(
    api_key: String,
    expires_in_seconds: Option<u64>,
) -> Result<String, String> {
    // v3 API limits expires_in_seconds to max 600 seconds (10 minutes)
    let expires_in = expires_in_seconds.unwrap_or(600).min(600);

    let client = reqwest::Client::new();
    // v3 uses GET with query parameters instead of POST with JSON body
    let url = format!(
        "https://streaming.assemblyai.com/v3/token?expires_in_seconds={}",
        expires_in
    );

    let resp = client
        .get(&url)
        .header("Authorization", api_key)
        .send()
        .await
        .map_err(|e| format!("assemblyai_token_request_failed:{}", e))?;

    let status = resp.status();
    let body = resp
        .text()
        .await
        .map_err(|e| format!("assemblyai_token_read_failed:{}", e))?;

    if !status.is_success() {
        return Err(format!(
            "assemblyai_token_failed:{}:{}",
            status.as_u16(),
            body
        ));
    }

    let parsed: AssemblyAiTokenResponse = serde_json::from_str(&body)
        .map_err(|e| format!("assemblyai_token_parse_failed:{}:{}", e, body))?;

    Ok(parsed.token)
}

// Keep old function name as alias for backward compatibility during transition
#[tauri::command]
async fn assemblyai_create_realtime_token(
    api_key: String,
    expires_in: Option<u64>,
) -> Result<String, String> {
    assemblyai_create_streaming_token(api_key, expires_in).await
}

#[tauri::command]
fn write_text_to_file(file_path: String, content: String) -> Result<(), String> {
    use std::fs::{create_dir_all, File};
    use std::io::Write;
    use std::path::Path;

    // Normalize path:
    // - trim whitespace (common when users paste paths)
    // - expand "~/" to HOME (common expectation on macOS/Linux)
    let mut normalized = file_path.trim().to_string();
    if normalized.starts_with("~/") || normalized == "~" {
        let home = std::env::var("HOME")
            .or_else(|_| std::env::var("USERPROFILE"))
            .map_err(|_| "home_dir_unavailable".to_string())?;
        if normalized == "~" {
            normalized = home;
        } else {
            normalized = format!("{}/{}", home.trim_end_matches('/'), &normalized[2..]);
        }
    }

    let path = Path::new(&normalized);
    if let Some(parent_dir) = path.parent() {
        if !parent_dir.exists() {
            create_dir_all(parent_dir).map_err(|e| e.to_string())?;
        }
    }
    let mut file = File::create(&normalized).map_err(|e| {
        format!("create_failed:{}:{}", normalized, e)
    })?;
    file
        .write_all(content.as_bytes())
        .map_err(|e| format!("write_failed:{}:{}", normalized, e))?;
    Ok(())
}

#[tauri::command]
fn write_binary_to_file(file_path: String, data_base64: String) -> Result<(), String> {
    use std::fs::{create_dir_all, File};
    use std::io::Write;
    use std::path::Path;

    // Normalize path (same as write_text_to_file)
    let mut normalized = file_path.trim().to_string();
    if normalized.starts_with("~/") || normalized == "~" {
        let home = std::env::var("HOME")
            .or_else(|_| std::env::var("USERPROFILE"))
            .map_err(|_| "home_dir_unavailable".to_string())?;
        if normalized == "~" {
            normalized = home;
        } else {
            normalized = format!("{}/{}", home.trim_end_matches('/'), &normalized[2..]);
        }
    }

    // Decode base64 data
    let data = base64::engine::general_purpose::STANDARD
        .decode(&data_base64)
        .map_err(|e| format!("base64_decode_failed:{}", e))?;

    let path = Path::new(&normalized);
    if let Some(parent_dir) = path.parent() {
        if !parent_dir.exists() {
            create_dir_all(parent_dir).map_err(|e| e.to_string())?;
        }
    }
    
    let mut file = File::create(&normalized).map_err(|e| {
        format!("create_failed:{}:{}", normalized, e)
    })?;
    file
        .write_all(&data)
        .map_err(|e| format!("write_failed:{}:{}", normalized, e))?;
    Ok(())
}

#[tauri::command]
fn ensure_output_folder(path: String) -> Result<(), String> {
    use std::fs::create_dir_all;
    use std::path::Path;

    let mut normalized = path.trim().to_string();
    if normalized.starts_with("~/") || normalized == "~" {
        let home = std::env::var("HOME")
            .or_else(|_| std::env::var("USERPROFILE"))
            .map_err(|_| "home_dir_unavailable".to_string())?;
        if normalized == "~" {
            normalized = home;
        } else {
            normalized = format!("{}/{}", home.trim_end_matches('/'), &normalized[2..]);
        }
    }

    let dir_path = Path::new(&normalized);
    if !dir_path.exists() {
        create_dir_all(dir_path).map_err(|e| format!("create_dir_failed:{}:{}", normalized, e))?;
    }
    Ok(())
}

#[tauri::command]
async fn start_live_slides_server(app: tauri::AppHandle, port: u16) -> Result<String, String> {
    let state = SERVER_STATE.clone();
    
    // Check if already running
    if *state.running.read().await {
        return Err("Server is already running".to_string());
    }
    
    *state.running.write().await = true;
    *state.port.write().await = port;
    
    // Start combined HTTP + WebSocket server in background
    let port_clone = port;
    let app_handle = app.clone();
    tokio::spawn(async move {
        if let Err(e) = run_combined_server(port_clone, app_handle).await {
            eprintln!("Server error: {}", e);
        }
        // Mark as not running when server stops
        *SERVER_STATE.running.write().await = false;
    });
    
    // Small delay to let server start
    tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
    
    // Get local IP
    let local_ip = local_ip_address::local_ip()
        .map(|ip| ip.to_string())
        .unwrap_or_else(|_| {
            eprintln!("Warning: Failed to detect local IP, using 127.0.0.1");
            "127.0.0.1".to_string()
        });
    
    Ok(format!("http://{}:{}", local_ip, port))
}

#[tauri::command]
async fn stop_live_slides_server() -> Result<(), String> {
    let state = SERVER_STATE.clone();
    
    // Send shutdown signal
    if let Some(tx) = state.shutdown_tx.write().await.take() {
        let _ = tx.send(());
    }
    
    *state.running.write().await = false;
    Ok(())
}

#[tauri::command]
async fn create_live_slide_session(name: String) -> Result<LiveSlideSession, String> {
    let state = SERVER_STATE.clone();
    
    let session_id = uuid::Uuid::new_v4().to_string();
    let session = LiveSlideSession {
        id: session_id.clone(),
        name,
        slides: Vec::new(),
        raw_text: String::new(),
        created_at: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs(),
    };
    
    state.sessions.write().await.insert(session_id, session.clone());
    
    // Broadcast session creation
    let msg = WsMessage::SessionCreated { session: session.clone() };
    if let Ok(json) = serde_json::to_string(&msg) {
        let _ = state.broadcast_tx.send(json);
    }
    
    Ok(session)
}

#[tauri::command]
async fn delete_live_slide_session(session_id: String) -> Result<(), String> {
    let state = SERVER_STATE.clone();
    
    state.sessions.write().await.remove(&session_id);
    
    // Broadcast session deletion
    let msg = WsMessage::SessionDeleted { session_id };
    if let Ok(json) = serde_json::to_string(&msg) {
        let _ = state.broadcast_tx.send(json);
    }
    
    Ok(())
}

#[tauri::command]
async fn get_live_slide_sessions() -> Result<Vec<LiveSlideSession>, String> {
    let state = SERVER_STATE.clone();
    let sessions = state.sessions.read().await;
    Ok(sessions.values().cloned().collect())
}

#[tauri::command]
async fn get_live_slides_server_info() -> Result<LiveSlidesState, String> {
    let state = SERVER_STATE.clone();
    
    let sessions = state.sessions.read().await.clone();
    let running = *state.running.read().await;
    let port = *state.port.read().await;
    
    let local_ip = local_ip_address::local_ip()
        .map(|ip| ip.to_string())
        .unwrap_or_else(|_| "localhost".to_string());
    
    Ok(LiveSlidesState {
        sessions,
        server_running: running,
        server_port: port,
        local_ip,
    })
}

#[tauri::command]
async fn set_api_enabled(enabled: bool) -> Result<(), String> {
    let state = SERVER_STATE.clone();
    *state.api_enabled.write().await = enabled;
    Ok(())
}

#[tauri::command]
fn get_local_ip() -> String {
    local_ip_address::local_ip()
        .map(|ip| ip.to_string())
        .unwrap_or_else(|_| "localhost".to_string())
}

#[tauri::command]
async fn update_schedule(
    schedule: Vec<ScheduleItem>,
    current_session_index: Option<usize>,
) -> Result<(), String> {
    let state = SERVER_STATE.clone();
    
    // Update schedule state
    {
        let mut schedule_state = state.schedule.write().await;
        schedule_state.schedule = schedule.clone();
        schedule_state.current_session_index = current_session_index;
    }
    
    // Broadcast schedule update to all connected clients
    let update = WsMessage::ScheduleUpdate {
        schedule,
        current_session_index,
    };
    if let Ok(json) = serde_json::to_string(&update) {
        let _ = state.broadcast_tx.send(json);
    }
    
    Ok(())
}

#[tauri::command]
async fn update_timer_state(
    is_running: bool,
    time_left: i32,
    session_name: Option<String>,
    end_time: Option<String>,
    is_overrun: bool,
) -> Result<(), String> {
    let state = SERVER_STATE.clone();
    
    // Update timer state
    {
        let mut timer_state = state.timer_state.write().await;
        timer_state.is_running = is_running;
        timer_state.time_left = time_left;
        timer_state.session_name = session_name.clone();
        timer_state.end_time = end_time.clone();
        timer_state.is_overrun = is_overrun;
    }
    
    // Broadcast timer update to all connected clients
    let update = WsMessage::TimerUpdate {
        timer_state: TimerState {
            is_running,
            time_left,
            session_name,
            end_time,
            is_overrun,
        },
    };
    if let Ok(json) = serde_json::to_string(&update) {
        let _ = state.broadcast_tx.send(json);
    }
    
    Ok(())
}

#[tauri::command]
async fn update_display_state(
    verse_text: String,
    reference: String,
    slides: Vec<String>,
    settings: serde_json::Value,
) -> Result<(), String> {
    let state = SERVER_STATE.clone();
    
    // Update display state
    {
        let mut display_state = state.display_state.write().await;
        display_state.scripture = DisplayScripture {
            verse_text: verse_text.clone(),
            reference: reference.clone(),
        };
        display_state.slides = slides.clone();
        display_state.settings = settings.clone();
    }
    
    // Broadcast display update to all connected clients
    let update = WsMessage::DisplayUpdate {
        scripture: DisplayScripture {
            verse_text,
            reference,
        },
        slides,
        settings,
    };
    if let Ok(json) = serde_json::to_string(&update) {
        let _ = state.broadcast_tx.send(json);
    }
    
    Ok(())
}

// ============================================================================
// Network Sync Tauri Commands
// ============================================================================

#[tauri::command]
async fn start_sync_server(port: u16, mode: String) -> Result<SyncServerInfo, String> {
    let state = SYNC_SERVER_STATE.clone();
    
    // Check if already running
    if *state.running.read().await {
        return Err("Sync server is already running".to_string());
    }
    
    *state.running.write().await = true;
    *state.port.write().await = port;
    *state.server_mode.write().await = mode;
    
    // Start sync server in background
    let port_clone = port;
    tokio::spawn(async move {
        if let Err(e) = run_sync_server(port_clone).await {
            eprintln!("Sync server error: {}", e);
        }
        // Mark as not running when server stops
        *SYNC_SERVER_STATE.running.write().await = false;
    });
    
    // Small delay to let server start
    tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
    
    // Get local IP
    let local_ip = local_ip_address::local_ip()
        .map(|ip| ip.to_string())
        .unwrap_or_else(|_| "127.0.0.1".to_string());
    
    Ok(SyncServerInfo {
        running: true,
        port,
        local_ip,
        connected_clients: 0,
    })
}

#[tauri::command]
async fn stop_sync_server() -> Result<(), String> {
    let state = SYNC_SERVER_STATE.clone();
    
    // Send shutdown signal
    if let Some(tx) = state.shutdown_tx.write().await.take() {
        let _ = tx.send(());
    }
    
    *state.running.write().await = false;
    *state.connected_clients.write().await = 0;
    Ok(())
}

#[tauri::command]
async fn get_sync_server_info() -> Result<SyncServerInfo, String> {
    let state = SYNC_SERVER_STATE.clone();
    
    let running = *state.running.read().await;
    let port = *state.port.read().await;
    let connected_clients = *state.connected_clients.read().await;
    
    let local_ip = local_ip_address::local_ip()
        .map(|ip| ip.to_string())
        .unwrap_or_else(|_| "localhost".to_string());
    
    Ok(SyncServerInfo {
        running,
        port,
        local_ip,
        connected_clients,
    })
}

#[tauri::command]
async fn broadcast_sync_message(message: String) -> Result<(), String> {
    let state = SYNC_SERVER_STATE.clone();
    
    if !*state.running.read().await {
        return Err("Sync server is not running".to_string());
    }
    
    // Parse and update cached state if needed
    if let Ok(sync_msg) = serde_json::from_str::<SyncMessage>(&message) {
        match &sync_msg {
            SyncMessage::PlaylistItem { .. } | SyncMessage::PlaylistDelete { .. } => {
                // These are partial updates, we don't cache them individually
            }
            SyncMessage::Schedule { schedule, current_session_index, .. } => {
                *state.schedule.write().await = Some(schedule.clone());
                *state.current_session_index.write().await = *current_session_index;
            }
            SyncMessage::FullState { playlists, schedule, current_session_index, .. } => {
                if let Some(p) = playlists {
                    *state.playlists.write().await = Some(p.clone());
                }
                if let Some(s) = schedule {
                    *state.schedule.write().await = Some(s.clone());
                }
                *state.current_session_index.write().await = *current_session_index;
            }
            _ => {}
        }
    }
    
    state.broadcast_tx.send(message)
        .map_err(|e| format!("Failed to broadcast: {}", e))?;
    
    Ok(())
}

// ============================================================================
// Live Slides Broadcast (generic)
// ============================================================================

#[tauri::command]
async fn broadcast_live_slides_message(message: String) -> Result<(), String> {
    let state = SERVER_STATE.clone();

    // If the server isn't running, there's nowhere to broadcast to.
    // We return an error so callers can decide whether to surface it or ignore it.
    if !*state.running.read().await {
        return Err("Live Slides server is not running".to_string());
    }

    state
        .broadcast_tx
        .send(message)
        .map_err(|e| format!("Failed to broadcast: {}", e))?;

    Ok(())
}

#[tauri::command]
async fn update_sync_playlists(playlists: serde_json::Value) -> Result<(), String> {
    let state = SYNC_SERVER_STATE.clone();
    *state.playlists.write().await = Some(playlists);
    Ok(())
}

// ============================================================================
// MIDI Support
// ============================================================================

#[derive(Debug, Clone, Serialize)]
pub struct MidiDevice {
    pub id: String,
    pub name: String,
}

#[tauri::command]
fn list_midi_output_devices() -> Result<Vec<MidiDevice>, String> {
    use midir::MidiOutput;
    
    let midi_out = MidiOutput::new("ProAssist MIDI Output")
        .map_err(|e| format!("Failed to create MIDI output: {}", e))?;
    
    let ports = midi_out.ports();
    let mut devices = Vec::new();
    
    for (i, port) in ports.iter().enumerate() {
        if let Ok(name) = midi_out.port_name(port) {
            devices.push(MidiDevice {
                id: i.to_string(),
                name,
            });
        }
    }
    
    Ok(devices)
}

#[tauri::command]
fn send_midi_note(
    device_id: String,
    channel: u8,
    note: u8,
    velocity: u8,
) -> Result<(), String> {
    use midir::MidiOutput;
    
    // Validate channel (0-15, but we'll use 1-16 for user input)
    let channel = if channel == 0 || channel > 16 {
        return Err("Channel must be between 1 and 16".to_string());
    } else {
        channel - 1 // Convert to 0-15 for MIDI
    };
    
    // Validate note (0-127)
    if note > 127 {
        return Err("Note must be between 0 and 127".to_string());
    }
    
    // Validate velocity (0-127)
    if velocity > 127 {
        return Err("Velocity must be between 0 and 127".to_string());
    }
    
    let midi_out = MidiOutput::new("ProAssist MIDI Output")
        .map_err(|e| format!("Failed to create MIDI output: {}", e))?;
    
    let ports = midi_out.ports();
    let device_index: usize = device_id.parse()
        .map_err(|_| format!("Invalid device ID: {}", device_id))?;
    
    if device_index >= ports.len() {
        return Err(format!("Device ID {} out of range ({} devices available)", device_index, ports.len()));
    }
    
    let port = &ports[device_index];
    
    // Create connection
    let mut conn_out = midi_out.connect(port, "proassist-midi-out")
        .map_err(|e| format!("Failed to connect to MIDI device: {}", e))?;
    
    // Send Note On message: 0x90 + channel (0-15), note (0-127), velocity (0-127)
    let status = 0x90 | channel;
    let message = [status, note, velocity];
    
    conn_out.send(&message)
        .map_err(|e| format!("Failed to send MIDI message: {}", e))?;
    
    // Send Note Off message immediately (0x80 + channel, note, 0)
    // This creates a short note trigger
    let status_off = 0x80 | channel;
    let message_off = [status_off, note, 0];
    
    // Small delay to ensure note is registered
    std::thread::sleep(std::time::Duration::from_millis(10));
    
    conn_out.send(&message_off)
        .map_err(|e| format!("Failed to send MIDI note off: {}", e))?;
    
    // Connection is dropped here, which closes it
    drop(conn_out);
    
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_process::init());

    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        builder = builder.plugin(tauri_plugin_window_state::Builder::new().build());
    }

    builder
        .setup(|app| {
            #[cfg(desktop)]
            app.handle().plugin(tauri_plugin_updater::Builder::new().build())?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            toggle_devtools,
            get_available_monitors_safe,
            open_audience_display_window,
            open_dialog,
            close_dialog,
            get_available_system_fonts,
            list_native_audio_input_devices,
            start_native_audio_stream,
            stop_native_audio_stream,
            // Native audio recording commands
            start_native_audio_recording,
            stop_native_audio_recording,
            is_audio_recording,
            get_audio_recording_duration,
            // Streaming video recording commands (production-grade - no memory accumulation)
            start_streaming_video_recording,
            append_video_chunk,
            finalize_streaming_video_recording,
            is_video_streaming_recording,
            get_video_recording_stats,
            abort_streaming_video_recording,
            // Streaming web audio recording commands (crash-safe MP3 recording)
            start_streaming_web_audio_recording,
            append_web_audio_chunk,
            finalize_streaming_web_audio_recording,
            is_web_audio_streaming_recording,
            get_web_audio_recording_stats,
            abort_streaming_web_audio_recording,
            // File utilities for audio conversion
            read_file_as_base64,
            delete_file,
            // AssemblyAI Universal Streaming v3 token
            assemblyai_create_streaming_token,
            assemblyai_create_realtime_token, // backward compat alias
            write_text_to_file,
            write_binary_to_file,
            ensure_output_folder,
            start_live_slides_server,
            stop_live_slides_server,
            create_live_slide_session,
            delete_live_slide_session,
            get_live_slide_sessions,
            get_live_slides_server_info,
            set_api_enabled,
            get_local_ip,
            update_schedule,
            update_timer_state,
            update_display_state,
            // Network Sync commands
            start_sync_server,
            stop_sync_server,
            get_sync_server_info,
            broadcast_sync_message,
            update_sync_playlists,
            // Live Slides generic broadcast
            broadcast_live_slides_message,
            // MIDI commands
            list_midi_output_devices,
            send_midi_note
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
