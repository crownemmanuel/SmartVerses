/**
 * Recorder Types
 * 
 * Type definitions for the Recorder feature including settings,
 * recording state, and device information.
 */

// ============================================================================
// Recording State Types
// ============================================================================

export type RecordingStatus = 'idle' | 'recording' | 'paused' | 'stopped';

export interface RecordingState {
  status: RecordingStatus;
  startTime: number | null;  // Unix timestamp when recording started
  elapsedTime: number;       // Elapsed time in seconds
  pausedTime: number;        // Total time spent paused
}

export interface VideoRecordingState extends RecordingState {
  type: 'video';
  previewStream: MediaStream | null;
  recordedBlob: Blob | null;
  recordedUrl: string | null;
}

export interface AudioRecordingState extends RecordingState {
  type: 'audio';
  recordedBlob: Blob | null;
  recordedUrl: string | null;
  audioLevels: number[];  // For waveform visualization
}

// ============================================================================
// Device Types
// ============================================================================

export interface MediaDeviceOption {
  deviceId: string;
  label: string;
  kind: 'videoinput' | 'audioinput';
  isDefault?: boolean;
}

// ============================================================================
// Settings Types
// ============================================================================

export type VideoFormat = 'mp4' | 'webm';
export type VideoAudioCodec = 'aac' | 'opus';
export type VideoResolution = '720p' | '1080p' | '1440p' | '4k';
export type AudioFormat = 'mp3' | 'wav';
export type AudioBitrate = '128k' | '192k' | '320k';

export type NamingPattern = 'timestamp' | 'session_timestamp' | 'custom_timestamp';

export interface RecorderSettings {
  // Device settings
  selectedVideoDeviceId: string | null;
  selectedVideoAudioDeviceId: string | null;
  selectedAudioDeviceId: string | null;
  
  // Video settings
  videoFormat: VideoFormat;
  videoAudioCodec: VideoAudioCodec;
  videoResolution: VideoResolution;
  videoAudioDelayMs: number;
  
  // Audio settings
  audioFormat: AudioFormat;
  audioBitrate: AudioBitrate;
  
  // Output settings
  outputBasePath: string;
  namingPattern: NamingPattern;
  customPrefix: string;  // Used when namingPattern is 'custom_timestamp'
  includeSessionName: boolean;  // Prepend current schedule session to filename
}

export const DEFAULT_RECORDER_SETTINGS: RecorderSettings = {
  selectedVideoDeviceId: null,
  selectedVideoAudioDeviceId: null,
  selectedAudioDeviceId: null,
  videoFormat: 'mp4',
  videoAudioCodec: 'aac',
  videoResolution: '1080p',
  videoAudioDelayMs: 0,
  audioFormat: 'wav',
  audioBitrate: '320k',
  outputBasePath: '~/Documents/ProAssist/Recordings',
  namingPattern: 'session_timestamp',
  customPrefix: 'recording',
  includeSessionName: true,
};

// ============================================================================
// Recording Result Types
// ============================================================================

export interface RecordingResult {
  success: boolean;
  filePath?: string;
  fileName?: string;
  duration?: number;  // Duration in seconds
  fileSize?: number;  // File size in bytes
  error?: string;
}

// ============================================================================
// Video Resolution Configurations
// ============================================================================

export const VIDEO_RESOLUTION_CONFIG: Record<VideoResolution, { width: number; height: number }> = {
  '720p': { width: 1280, height: 720 },
  '1080p': { width: 1920, height: 1080 },
  '1440p': { width: 2560, height: 1440 },
  '4k': { width: 3840, height: 2160 },
};

// ============================================================================
// Audio Bitrate Configurations (in bits per second)
// ============================================================================

export const AUDIO_BITRATE_CONFIG: Record<AudioBitrate, number> = {
  '128k': 128000,
  '192k': 192000,
  '320k': 320000,
};

// ============================================================================
// Feature Flags Types
// ============================================================================

export interface EnabledFeatures {
  slides: boolean;
  timer: boolean;
  liveTestimonies: boolean;
  smartVerses: boolean;
  recorder: boolean;
}

export const DEFAULT_ENABLED_FEATURES: EnabledFeatures = {
  slides: true,
  timer: true,
  liveTestimonies: true,
  smartVerses: true,
  recorder: true,
};

// ============================================================================
// Storage Keys
// ============================================================================

export const RECORDER_SETTINGS_KEY = 'proassist-recorder-settings';
export const ENABLED_FEATURES_KEY = 'proassist-enabled-features';
