import { invoke } from "@tauri-apps/api/core";
import { KeyPoint, ParaphrasedVerse, TranscriptionSegment } from "../types/smartVerses";

export type TranscriptionStreamKind = "interim" | "final";

export interface TranscriptionStreamMessage {
  type: "transcription_stream";
  kind: TranscriptionStreamKind;
  timestamp: number;
  engine: string;
  text: string;
  segment?: TranscriptionSegment;
  scripture_references?: string[];
  key_points?: KeyPoint[];
  paraphrased_verses?: ParaphrasedVerse[];
}

/**
 * Broadcast a transcription stream message to all Live Slides WebSocket clients (/ws).
 *
 * Note: This only works inside the Tauri app (because it uses `invoke`).
 * External web clients should just connect to the Live Slides server and listen.
 */
export async function broadcastTranscriptionStreamMessage(
  msg: TranscriptionStreamMessage
): Promise<void> {
  const json = JSON.stringify(msg);
  await invoke("broadcast_live_slides_message", { message: json });
}

