/**
 * Transcription overlap utilities
 *
 * Pure functions used by OfflineWhisperTranscriptionService (and Mac native)
 * to remove overlapping text when streaming transcription: each chunk may
 * re-transcribe a bit of the previous chunk (context), so we detect
 * suffix/prefix overlap and return only the new portion.
 *
 * Exported for unit testing. Do not depend on Tauri or app globals.
 */

/**
 * Normalize text for overlap comparison: lowercase, strip punctuation, collapse whitespace.
 */
export function normalizeOverlapText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9'\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extract only the new portion of a transcription given the previous full text.
 * Finds the longest common suffix-of-last / prefix-of-new match (word-based, then
 * character-based) and returns the remainder of newText.
 *
 * @param lastTranscriptionText - Full text of the previous emitted transcription
 * @param newText - Full text of the current chunk (may include overlap)
 * @returns The portion of newText that is new (no overlap with last)
 */
export function extractNewTranscriptionText(
  lastTranscriptionText: string,
  newText: string
): string {
  if (!lastTranscriptionText?.trim()) {
    return newText;
  }

  const lastTrimmed = lastTranscriptionText.trim();
  const newTrimmed = newText.trim();

  if (!lastTrimmed || !newTrimmed) {
    return newText;
  }

  const lastNormalized = normalizeOverlapText(lastTrimmed);
  const newNormalized = normalizeOverlapText(newTrimmed);

  if (!lastNormalized || !newNormalized) {
    return newText;
  }

  // Word-based matching first
  const lastWords = lastNormalized.split(/\s+/);
  const newWords = newNormalized.split(/\s+/);
  let maxOverlapWords = 0;
  const minOverlapWords = 2;

  for (let i = Math.min(lastWords.length, newWords.length); i >= minOverlapWords; i--) {
    const lastSuffix = lastWords.slice(-i).join(" ");
    const newPrefix = newWords.slice(0, i).join(" ");
    if (lastSuffix === newPrefix) {
      maxOverlapWords = i;
      break;
    }
  }

  if (maxOverlapWords > 0) {
    const originalWords = newTrimmed.split(/\s+/);
    return originalWords.slice(maxOverlapWords).join(" ").trim();
  }

  // Character-based fallback
  let maxOverlapLength = 0;
  const minOverlapLength = 20;

  for (let i = Math.min(lastNormalized.length, newNormalized.length); i >= minOverlapLength; i--) {
    const lastSuffix = lastNormalized.slice(-i);
    const newPrefix = newNormalized.slice(0, i);
    if (lastSuffix === newPrefix) {
      maxOverlapLength = i;
      break;
    }
  }

  if (maxOverlapLength > 0) {
    const words = newTrimmed.split(/\s+/);
    let charCount = 0;
    let wordIndex = words.length;
    for (let i = 0; i < words.length; i++) {
      const normalizedWord = normalizeOverlapText(words[i]);
      const wordLength = normalizedWord ? normalizedWord.length + 1 : 0;
      if (wordLength > 0 && charCount + wordLength > maxOverlapLength) {
        wordIndex = i;
        break;
      }
      charCount += wordLength;
    }
    return words.slice(wordIndex).join(" ").trim();
  }

  return newText;
}
