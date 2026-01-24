/**
 * Bible Text Search Service
 * 
 * Full-text search implementation for Bible verses using FlexSearch.
 * This provides keyword-based search across all Bible verses when
 * direct reference parsing fails.
 */

import { Document } from 'flexsearch';
import { loadVerses } from './bibleService';
import { DetectedBibleReference } from '../types/smartVerses';

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
let searchIndex: any = null;
let verseMap: Map<string, VerseEntry> = new Map();
let isIndexed = false;
let indexPromise: Promise<void> | null = null;

/**
 * Initialize the search index from the KJV verses data
 */
async function initializeIndex(): Promise<void> {
  if (isIndexed) return;
  
  if (indexPromise) {
    await indexPromise;
    return;
  }
  
  indexPromise = (async () => {
    try {
      console.log('[BibleTextSearch] Initializing search index...');
      
      const verses = await loadVerses();
      
      // Create FlexSearch document index
      searchIndex = new Document({
        document: {
          id: 'reference',
          index: ['text'],
        },
        tokenize: 'forward',
        cache: true,
      });
      
      // Clear previous mapping
      verseMap.clear();
      
      // Index all verses
      // KJV format: { "Genesis 1:1": "In the beginning...", ... }
      let count = 0;
      for (const [reference, text] of Object.entries(verses)) {
        // Parse reference like "Genesis 1:1" or "1 John 3:16"
        const match = reference.match(/^(.+?)\s+(\d+):(\d+)$/);
        if (match) {
          const [, book, chapter, verse] = match;
          const entry: VerseEntry = {
            reference,
            book,
            chapter: parseInt(chapter),
            verse: parseInt(verse),
            text: text as string,
          };
          
          verseMap.set(reference, entry);
          searchIndex.add(entry);
          count++;
        }
      }
      
      isIndexed = true;
      console.log(`[BibleTextSearch] Indexed ${count} verses successfully`);
    } catch (error) {
      console.error('[BibleTextSearch] Failed to initialize index:', error);
      indexPromise = null;
      throw error;
    }
  })();
  
  await indexPromise;
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
  options?: { suggest?: boolean }
): Promise<SearchResult[]> {
  await initializeIndex();
  
  if (!searchIndex) {
    return [];
  }
  
  const results: SearchResult[] = [];
  
  try {
    const searchResults = searchIndex.search(query, {
      limit,
      suggest: options?.suggest ?? false,
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
  limit: number = 10
): Promise<DetectedBibleReference[]> {
  const results = await searchBibleText(query, limit);
  
  return results.map((result, index) => ({
    id: `text-search-${Date.now()}-${index}`,
    reference: result.reference,
    displayRef: result.reference,
    verseText: result.text
      .replace(/^#\s*/, '')
      .replace(/\[([^\]]+)\]/g, '$1'),
    source: 'direct' as const,
    timestamp: Date.now(),
    book: result.book,
    chapter: result.chapter,
    verse: result.verse,
  }));
}

/**
 * Check if the index is ready
 */
export function isSearchIndexReady(): boolean {
  return isIndexed;
}

/**
 * Pre-initialize the index (call on app startup for faster first search)
 */
export async function preloadSearchIndex(): Promise<void> {
  await initializeIndex();
}
