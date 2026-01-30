/**
 * Bible Text Search Service
 * 
 * Full-text search implementation for Bible verses using FlexSearch.
 * This provides keyword-based search across all Bible verses when
 * direct reference parsing fails.
 */

import { Document } from 'flexsearch';
import { BUILTIN_KJV_ID } from "./bibleLibraryService";
import { loadVerses } from "./bibleService";
import { DetectedBibleReference } from "../types/smartVerses";

// =============================================================================
// TYPES
// =============================================================================

interface VerseEntry {
  reference: string;
  book: string;
  chapter: number;
  verse: number;
  text: string;
}

interface SearchResult {
  reference: string;
  text: string;
  book: string;
  chapter: number;
  verse: number;
}

// =============================================================================
// SINGLETON INDEX
// =============================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const searchIndexMap: Map<string, any> = new Map();
const verseMapByTranslation: Map<string, Map<string, VerseEntry>> = new Map();
const indexedTranslations: Set<string> = new Set();
const indexPromises: Map<string, Promise<void>> = new Map();

/**
 * Initialize the search index from the KJV verses data
 */
async function initializeIndex(translationId: string): Promise<void> {
  if (indexedTranslations.has(translationId)) return;

  if (indexPromises.has(translationId)) {
    await indexPromises.get(translationId);
    return;
  }

  const promise = (async () => {
    try {
      console.log(
        `[BibleTextSearch] Initializing search index (${translationId})...`
      );

      const verses = await loadVerses(translationId);

      const searchIndex = new Document({
        document: {
          id: "reference",
          index: ["text"],
        },
        tokenize: "forward",
        cache: true,
      });

      const verseMap = new Map<string, VerseEntry>();

      let count = 0;
      for (const [reference, text] of Object.entries(verses)) {
        const match = reference.match(/^(.+?)\s+(\d+):(\d+)$/);
        if (match) {
          const [, book, chapter, verse] = match;
          const entry: VerseEntry = {
            reference,
            book,
            chapter: parseInt(chapter, 10),
            verse: parseInt(verse, 10),
            text: text as string,
          };

          verseMap.set(reference, entry);
          searchIndex.add(entry);
          count++;
        }
      }

      searchIndexMap.set(translationId, searchIndex);
      verseMapByTranslation.set(translationId, verseMap);
      indexedTranslations.add(translationId);
      console.log(
        `[BibleTextSearch] Indexed ${count} verses successfully (${translationId})`
      );
    } catch (error) {
      console.error(
        "[BibleTextSearch] Failed to initialize index:",
        error
      );
      indexPromises.delete(translationId);
      throw error;
    }
  })();

  indexPromises.set(translationId, promise);
  await promise;
}

/**
 * Search Bible verses by query string
 * Returns verses that contain matching text
 * 
 * @param query - Search query string
 * @param limit - Maximum number of results (default 10)
 * @returns Array of search results
 */
export async function searchBibleText(
  query: string,
  limit: number = 10,
  translationIdOrOptions?: string | { suggest?: boolean },
  options?: { suggest?: boolean }
): Promise<SearchResult[]> {
  const translationId =
    typeof translationIdOrOptions === "string"
      ? translationIdOrOptions
      : BUILTIN_KJV_ID;
  const searchOptions =
    typeof translationIdOrOptions === "string"
      ? options
      : translationIdOrOptions;
  await initializeIndex(translationId);

  const searchIndex = searchIndexMap.get(translationId);
  const verseMap = verseMapByTranslation.get(translationId);

  if (!searchIndex || !verseMap) {
    return [];
  }

  const results: SearchResult[] = [];
  
  try {
    const searchResults = searchIndex.search(query, {
      limit,
      suggest: searchOptions?.suggest ?? false,
    }) as Array<{ result: string[] }>;
    
    // FlexSearch returns an array with field results
    for (const fieldResult of searchResults) {
      for (const reference of fieldResult.result) {
        const entry = verseMap.get(reference);
        if (entry && results.length < limit) {
          results.push({
            reference: entry.reference,
            text: entry.text,
            book: entry.book,
            chapter: entry.chapter,
            verse: entry.verse,
          });
        }
      }
    }
  } catch (error) {
    console.error('[BibleTextSearch] Search error:', error);
  }
  
  return results;
}

/**
 * Search and return as DetectedBibleReference format
 * For use in SmartVerses
 */
export async function searchBibleTextAsReferences(
  query: string,
  limit: number = 10,
  translationId: string = BUILTIN_KJV_ID
): Promise<DetectedBibleReference[]> {
  const results = await searchBibleText(query, limit, translationId);
  
  return results.map((result, index) => ({
    id: `text-search-${Date.now()}-${index}`,
    reference: result.reference,
    displayRef: result.reference,
    verseText: result.text
      .replace(/^#\s*/, '')
      .replace(/\[([^\]]+)\]/g, '$1'),
    source: 'direct' as const,
    timestamp: Date.now(),
    translationId,
    book: result.book,
    chapter: result.chapter,
    verse: result.verse,
  }));
}

/**
 * Check if the index is ready
 */
export function isSearchIndexReady(translationId: string = BUILTIN_KJV_ID): boolean {
  return indexedTranslations.has(translationId);
}

/**
 * Pre-initialize the index (call on app startup for faster first search)
 */
export async function preloadSearchIndex(
  translationId: string = BUILTIN_KJV_ID
): Promise<void> {
  await initializeIndex(translationId);
}

export function resetSearchIndexes(): void {
  searchIndexMap.clear();
  verseMapByTranslation.clear();
  indexedTranslations.clear();
  indexPromises.clear();
}
