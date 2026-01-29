/**
 * SmartVerses Types
 * 
 * Type definitions for the SmartVerses smart Bible lookup feature.
 */

// =============================================================================
// TRANSCRIPTION TYPES
// =============================================================================

export type TranscriptionEngine =
  | 'assemblyai'
  | 'elevenlabs'
  | 'whisper'
  | 'groq'
  | 'offline-whisper'
  | 'offline-whisper-native'
  | 'offline-moonshine';

export type AudioCaptureMode = 'webrtc' | 'native';

export interface TranscriptionConfig {
  engine: TranscriptionEngine;
  apiKey: string;
  sampleRate?: number;
  language?: string;
}

export interface TranscriptionSegment {
  id: string;
  text: string;
  timestamp: number;
  isFinal: boolean;
}

export interface ModelLoadingProgress {
  stage: string; // e.g., "Loading tokenizer...", "Loading model...", "Warming up model..."
  progress: number; // 0-100
  file?: string; // Current file being loaded
}

export interface TranscriptionCallbacks {
  onInterimTranscript?: (text: string) => void;
  onFinalTranscript?: (text: string, segment: TranscriptionSegment) => void;
  onError?: (error: Error) => void;
  onConnectionClose?: (code: number, reason: string) => void;
  onStatusChange?: (status: TranscriptionStatus) => void;
  onAudioLevel?: (level: number) => void;
  onModelLoadingProgress?: (progress: ModelLoadingProgress) => void;
}

export type TranscriptionStatus = 'idle' | 'connecting' | 'recording' | 'error' | 'waiting_for_browser';

// =============================================================================
// BIBLE REFERENCE TYPES
// =============================================================================

export interface ParsedBibleReference {
  book: string;
  fullBookName: string;
  chapter: number;
  endChapter?: number;
  startVerse: number;
  endVerse: number;
  translation: string;
  displayRef: string; // Human-readable reference like "John 3:16"
}

export interface BibleParseContext {
  book: string | null;
  chapter: number | null;
  verse: number | null;
  endChapter?: number | null;
  endVerse?: number | null;
  fullReference: string | null;
}

// =============================================================================
// AI ANALYSIS TYPES
// =============================================================================

export interface ParaphrasedVerse {
  reference: string;        // e.g., "John 3:16"
  confidence: number;       // 0.0 to 1.0
  matchedPhrase: string;    // Portion of transcript that matches
  verseText?: string;       // The actual verse text (looked up)
}

export type KeyPointCategory = 'quote' | 'action' | 'principle' | 'encouragement';

export interface KeyPoint {
  text: string;
  category: KeyPointCategory;
}

export interface TranscriptAnalysisResult {
  paraphrasedVerses: ParaphrasedVerse[];
  keyPoints: KeyPoint[];
}

// =============================================================================
// DETECTED REFERENCE TYPES (for display)
// =============================================================================

export type DetectedReferenceSource = 'direct' | 'paraphrase';

export interface DetectedBibleReference {
  id: string;
  reference: string;        // e.g., "John 3:16"
  displayRef: string;       // Human-readable reference
  verseText: string;        // The verse text
  source: DetectedReferenceSource;
  confidence?: number;      // For paraphrased references
  matchedPhrase?: string;   // For paraphrased references
  transcriptText?: string;  // The transcript text that contained this reference
  timestamp: number;
  // Verse components for navigation
  book?: string;
  chapter?: number;
  verse?: number;
  // Navigation tracking - true if this verse was loaded via prev/next navigation
  isNavigationResult?: boolean;
  // Highlight words from AI search
  highlight?: string[];     // Words to highlight in the verse text
}

// =============================================================================
// CHAT/SEARCH TYPES
// =============================================================================

export interface BibleSearchQuery {
  id: string;
  query: string;
  timestamp: number;
  isAISearch: boolean;
}

export interface BibleSearchResult {
  id: string;
  queryId: string;
  references: DetectedBibleReference[];
  timestamp: number;
  error?: string;
}

export interface SmartVersesChatMessage {
  id: string;
  type: 'query' | 'result' | 'system';
  content: string;
  timestamp: number;
  references?: DetectedBibleReference[];
  isLoading?: boolean;
  error?: string;
}

// =============================================================================
// SETTINGS TYPES
// =============================================================================

// =============================================================================
// OFFLINE MODEL TYPES
// =============================================================================

export type OfflineModelType = 'whisper' | 'moonshine';

export interface OfflineModelInfo {
  id: string;
  name: string;
  type: OfflineModelType;
  modelId: string; // HuggingFace model ID (e.g., 'onnx-community/whisper-base')
  size: string; // Human-readable size (e.g., '~150MB')
  description: string;
  isDownloaded: boolean;
  downloadProgress?: number; // 0-100
  isDownloading?: boolean;
  supportsWebGPU: boolean;
  supportsWASM: boolean;
}

export const AVAILABLE_OFFLINE_MODELS: OfflineModelInfo[] = [
  {
    id: 'whisper-tiny-en',
    name: 'Whisper Tiny (English)',
    type: 'whisper',
    modelId: 'onnx-community/whisper-tiny.en',
    size: '~40MB',
    description: 'Fastest, English only, lowest accuracy',
    isDownloaded: false,
    supportsWebGPU: true,
    supportsWASM: true,
  },
  {
    id: 'whisper-base',
    name: 'Whisper Base',
    type: 'whisper',
    modelId: 'onnx-community/whisper-base',
    size: '~150MB',
    description: 'Good balance of speed and accuracy, multilingual',
    isDownloaded: false,
    supportsWebGPU: true,
    supportsWASM: true,
  },
  {
    id: 'whisper-small',
    name: 'Whisper Small',
    type: 'whisper',
    modelId: 'onnx-community/whisper-small',
    size: '~500MB',
    description: 'Better accuracy, slower, multilingual',
    isDownloaded: false,
    supportsWebGPU: true,
    supportsWASM: true,
  },
  {
    id: 'moonshine-base',
    name: 'Moonshine Base',
    type: 'moonshine',
    modelId: 'onnx-community/moonshine-base-ONNX',
    size: '~200MB',
    description: 'Fast and accurate, optimized for real-time use',
    isDownloaded: false,
    supportsWebGPU: true,
    supportsWASM: true,
  },
  {
    id: 'moonshine-tiny',
    name: 'Moonshine Tiny',
    type: 'moonshine',
    modelId: 'onnx-community/moonshine-tiny-ONNX',
    size: '~50MB',
    description: 'Fastest Moonshine model, good for low-powered devices',
    isDownloaded: false,
    supportsWebGPU: true,
    supportsWASM: true,
  },
];

export interface SmartVersesSettings {
  // Transcription settings
  transcriptionEngine: TranscriptionEngine;
  assemblyAIApiKey?: string;
  groqApiKey?: string;
  groqModel?: string;
  selectedMicrophoneId?: string;
  audioCaptureMode?: AudioCaptureMode;
  selectedNativeMicrophoneId?: string;
  streamTranscriptionsToWebSocket: boolean;
  runTranscriptionInBrowser?: boolean; // When true, opens external browser for transcription
  remoteTranscriptionEnabled?: boolean;
  remoteTranscriptionHost?: string;
  remoteTranscriptionPort?: number;
  transcriptionTimeLimitMinutes?: number; // Auto-stop prompt threshold (default: 120)
  
  // Offline transcription settings
  offlineWhisperModel?: string; // Model ID for offline Whisper
  offlineWhisperNativeModel?: string; // File name for native Whisper (macOS)
  offlineMoonshineModel?: string; // Model ID for offline Moonshine
  offlineLanguage?: string; // Language code for offline transcription (e.g., 'en')
  
  // AI Search settings
  enableAISearch: boolean;
  bibleSearchProvider?: 'openai' | 'gemini' | 'groq';
  bibleSearchModel?: string;
  
  // AI Detection settings (for transcription)
  enableParaphraseDetection: boolean;
  enableKeyPointExtraction: boolean;
  keyPointExtractionInstructions?: string;
  paraphraseConfidenceThreshold: number; // Default 0.6
  aiMinWordCount: number; // Default 6
  
  // Display settings
  autoAddDetectedToHistory: boolean; // Add detected refs from transcription to chat history
  highlightDirectReferences: boolean;
  highlightParaphrasedReferences: boolean;
  directReferenceColor: string;      // Default pink/magenta
  paraphraseReferenceColor: string;  // Default blue
  transcriptFilterPhrases?: string[]; // Hide these transcript-only phrases
  
  // ProPresenter integration
  autoTriggerOnDetection: boolean;
  proPresenterActivation?: {
    presentationUuid: string;
    slideIndex: number;
    presentationName?: string;
    activationClicks?: number;   // Number of clicks when going live (default: 1)
    takeOffClicks?: number;      // Number of clicks when taking off live (default: 0)
    clearTextFileOnTakeOff?: boolean; // Whether to clear text files when taking off live (default: true)
  };
  proPresenterConnectionIds?: string[];
  selectedProPresenterConnectionId?: string; // The connection to use for Get Slide
  
  // Output settings
  bibleOutputPath?: string;
  bibleTextFileName?: string;
  bibleReferenceFileName?: string;
  clearTextAfterLive?: boolean;
  clearTextDelay?: number;
}

export const DEFAULT_SMART_VERSES_SETTINGS: SmartVersesSettings = {
  transcriptionEngine: 'assemblyai',
  audioCaptureMode: 'native',
  streamTranscriptionsToWebSocket: true,
  remoteTranscriptionEnabled: false,
  remoteTranscriptionHost: "",
  remoteTranscriptionPort: 9876,
  transcriptionTimeLimitMinutes: 120,
  offlineWhisperModel: 'onnx-community/whisper-base',
  offlineWhisperNativeModel: 'ggml-small.en-q5_1.bin',
  offlineMoonshineModel: 'onnx-community/moonshine-base-ONNX',
  offlineLanguage: 'en',
  enableAISearch: false, // Off by default - uses text search instead
  bibleSearchProvider: 'groq',
  bibleSearchModel: 'llama-3.3-70b-versatile',
  enableParaphraseDetection: true,
  enableKeyPointExtraction: false,
  keyPointExtractionInstructions:
    "Extract 1–2 concise, quotable key points suitable for slides/lower-thirds. Prefer short sentences, avoid filler, keep the original voice, and skip vague statements.",
  paraphraseConfidenceThreshold: 0.6,
  aiMinWordCount: 6,
  autoAddDetectedToHistory: false,
  highlightDirectReferences: true,
  highlightParaphrasedReferences: true,
  directReferenceColor: '#ec4899', // Pink
  paraphraseReferenceColor: '#3b82f6', // Blue
  transcriptFilterPhrases: ["[BLANK_AUDIO]", "[INAUDIBLE]"],
  autoTriggerOnDetection: false,
  clearTextAfterLive: true,
  clearTextDelay: 0,
};

// =============================================================================
// STORAGE KEYS
// =============================================================================

export const SMART_VERSES_SETTINGS_KEY = 'proassist-smartverses-settings';
export const SMART_VERSES_CHAT_HISTORY_KEY = 'proassist-smartverses-chat-history';
