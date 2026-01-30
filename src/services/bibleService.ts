/**
 * Bible Service
 * Handles detection and lookup of Bible references using bible-passage-reference-parser
 * and KJV verses from the local JSON file.
 */

import { bcv_parser } from "bible-passage-reference-parser/esm/bcv_parser";
import * as en from "bible-passage-reference-parser/esm/lang/en";
import { LayoutType } from "../types";
import { BUILTIN_KJV_ID, getTranslationById } from "./bibleLibraryService";

// Types for our Bible service
export interface BibleReference {
  osis: string; // e.g., "John.3.16" or "John.3.16-John.3.18"
  startBook: string;
  startChapter: number;
  startVerse: number;
  endBook?: string;
  endChapter?: number;
  endVerse?: number;
  displayRef: string; // Human-readable reference like "John 3:16"
}

export interface DetectedReference {
  reference: BibleReference;
  originalText: string;
  startIndex: number;
  endIndex: number;
}

export interface VerseSlide {
  text: string; // "Verse text\nReference"
  layout: LayoutType;
  isAutoScripture: boolean;
  reference: string;
}

// Singleton parser instance
let bcvParser: bcv_parser | null = null;

// Cached verses
const versesCache = new Map<string, Record<string, string>>();
const versesLoadPromises = new Map<string, Promise<Record<string, string>>>();

// Book name mapping from OSIS to standard names
const OSIS_TO_BOOK_NAME: Record<string, string> = {
  Gen: "Genesis",
  Exod: "Exodus",
  Lev: "Leviticus",
  Num: "Numbers",
  Deut: "Deuteronomy",
  Josh: "Joshua",
  Judg: "Judges",
  Ruth: "Ruth",
  "1Sam": "1 Samuel",
  "2Sam": "2 Samuel",
  "1Kgs": "1 Kings",
  "2Kgs": "2 Kings",
  "1Chr": "1 Chronicles",
  "2Chr": "2 Chronicles",
  Ezra: "Ezra",
  Neh: "Nehemiah",
  Esth: "Esther",
  Job: "Job",
  Ps: "Psalms",
  Prov: "Proverbs",
  Eccl: "Ecclesiastes",
  Song: "Song of Solomon",
  Isa: "Isaiah",
  Jer: "Jeremiah",
  Lam: "Lamentations",
  Ezek: "Ezekiel",
  Dan: "Daniel",
  Hos: "Hosea",
  Joel: "Joel",
  Amos: "Amos",
  Obad: "Obadiah",
  Jonah: "Jonah",
  Mic: "Micah",
  Nah: "Nahum",
  Hab: "Habakkuk",
  Zeph: "Zephaniah",
  Hag: "Haggai",
  Zech: "Zechariah",
  Mal: "Malachi",
  Matt: "Matthew",
  Mark: "Mark",
  Luke: "Luke",
  John: "John",
  Acts: "Acts",
  Rom: "Romans",
  "1Cor": "1 Corinthians",
  "2Cor": "2 Corinthians",
  Gal: "Galatians",
  Eph: "Ephesians",
  Phil: "Philippians",
  Col: "Colossians",
  "1Thess": "1 Thessalonians",
  "2Thess": "2 Thessalonians",
  "1Tim": "1 Timothy",
  "2Tim": "2 Timothy",
  Titus: "Titus",
  Phlm: "Philemon",
  Heb: "Hebrews",
  Jas: "James",
  "1Pet": "1 Peter",
  "2Pet": "2 Peter",
  "1John": "1 John",
  "2John": "2 John",
  "3John": "3 John",
  Jude: "Jude",
  Rev: "Revelation",
};

/**
 * Get or initialize the BCV parser
 */
function getParser(): bcv_parser {
  if (!bcvParser) {
    bcvParser = new bcv_parser(en);
    // Configure parser for common abbreviations
    bcvParser.set_options({
      osis_compaction_strategy: "bcv", // book.chapter.verse format
      consecutive_combination_strategy: "combine", // Combine consecutive refs
    });
  }
  return bcvParser;
}

/**
 * Load verses from the JSON file
 */
export async function loadVerses(
  translationId: string = BUILTIN_KJV_ID
): Promise<Record<string, string>> {
  const resolvedId = translationId || BUILTIN_KJV_ID;

  if (versesCache.has(resolvedId)) {
    return versesCache.get(resolvedId) as Record<string, string>;
  }

  if (versesLoadPromises.has(resolvedId)) {
    return versesLoadPromises.get(resolvedId) as Promise<Record<string, string>>;
  }

  const loadPromise = (async () => {
    const translation = await getTranslationById(resolvedId);
    const fallback =
      translation || (await getTranslationById(BUILTIN_KJV_ID));

    if (!fallback) {
      throw new Error("Failed to load built-in KJV translation.");
    }

    const finalId = translation ? resolvedId : BUILTIN_KJV_ID;
    versesCache.set(finalId, fallback.verseIndex);
    versesCache.set(resolvedId, fallback.verseIndex);
    versesLoadPromises.delete(resolvedId);
    return fallback.verseIndex;
  })().catch((error) => {
    versesLoadPromises.delete(resolvedId);
    throw error;
  });

  versesLoadPromises.set(resolvedId, loadPromise);
  return loadPromise;
}

export function clearVersesCache(): void {
  versesCache.clear();
  versesLoadPromises.clear();
}

/**
 * Convert OSIS book name to full book name used in KJV JSON
 */
function osisBookToFullName(osisBook: string): string {
  return OSIS_TO_BOOK_NAME[osisBook] || osisBook;
}

/**
 * Parse OSIS reference into components
 * e.g., "John.3.16" -> { book: "John", chapter: 3, verse: 16 }
 */
function parseOsisRef(osis: string): BibleReference {
  // Handle range like "John.3.16-John.3.18" or "Gen.1.1-Gen.1.5"
  const rangeParts = osis.split("-");
  const startParts = rangeParts[0].split(".");
  
  const startBook = startParts[0];
  const startChapter = parseInt(startParts[1], 10);
  const startVerse = parseInt(startParts[2], 10);

  let endBook: string | undefined;
  let endChapter: number | undefined;
  let endVerse: number | undefined;

  if (rangeParts.length > 1) {
    const endParts = rangeParts[1].split(".");
    endBook = endParts[0];
    endChapter = parseInt(endParts[1], 10);
    endVerse = parseInt(endParts[2], 10);
  }

  // Create display reference
  const fullBookName = osisBookToFullName(startBook);
  let displayRef = `${fullBookName} ${startChapter}:${startVerse}`;
  
  if (endVerse !== undefined) {
    const endFullBookName = osisBookToFullName(endBook || startBook);
    if (endBook && endBook !== startBook) {
      displayRef += ` - ${endFullBookName} ${endChapter}:${endVerse}`;
    } else if (endChapter !== undefined && endChapter !== startChapter) {
      displayRef += `-${endChapter}:${endVerse}`;
    } else {
      displayRef += `-${endVerse}`;
    }
  }

  return {
    osis,
    startBook,
    startChapter,
    startVerse,
    endBook,
    endChapter,
    endVerse,
    displayRef,
  };
}

/**
 * Detect Bible references in text
 */
export function detectBibleReferences(text: string): DetectedReference[] {
  const parser = getParser();
  
  // parse() returns the parser object, then we need to call osis_and_indices() to get results
  parser.parse(text);
  
  // Use osis_and_indices() which returns array of {osis, indices, translations}
  const osisResults = parser.osis_and_indices();
  const detected: DetectedReference[] = [];

  console.log("Bible parser input text:", text);
  console.log("Bible parser osis_and_indices result:", osisResults);

  for (const result of osisResults) {
    if (result.osis) {
      // Split by comma in case of multiple references in one entity
      const osisRefs = result.osis.split(",");
      for (const osis of osisRefs) {
        const reference = parseOsisRef(osis.trim());
        detected.push({
          reference,
          originalText: text.substring(result.indices[0], result.indices[1]),
          startIndex: result.indices[0],
          endIndex: result.indices[1],
        });
      }
    }
  }

  console.log("Detected references:", detected);
  return detected;
}

/**
 * Get verse text from loaded verses
 */
export function getVerseText(
  verses: Record<string, string>,
  bookName: string,
  chapter: number,
  verse: number
): string | null {
  // The KJV JSON uses format like "John 3:16", "Genesis 1:1"
  const key = `${bookName} ${chapter}:${verse}`;
  const text = verses[key];
  
  if (!text) {
    return null;
  }

  // Clean up the verse text
  // Remove # (paragraph marker) and convert [text] to regular text
  return text
    .replace(/^#\s*/, "") // Remove leading #
    .replace(/\[([^\]]+)\]/g, "$1"); // Remove brackets around italic words
}

/**
 * Get all verses for a reference (handles ranges)
 */
export async function getVersesForReference(
  reference: BibleReference,
  translationId: string = BUILTIN_KJV_ID
): Promise<Array<{ verse: number; chapter: number; book: string; text: string; displayRef: string }>> {
  const verses = await loadVerses(translationId);
  const result: Array<{ verse: number; chapter: number; book: string; text: string; displayRef: string }> = [];

  const startBook = osisBookToFullName(reference.startBook);
  const startChapter = reference.startChapter;
  const startVerse = reference.startVerse;
  const endVerse = reference.endVerse ?? startVerse;
  const endChapter = reference.endChapter ?? startChapter;
  const endBook = reference.endBook ? osisBookToFullName(reference.endBook) : startBook;

  console.log("getVersesForReference:", {
    reference,
    startBook,
    startChapter,
    startVerse,
    endVerse,
    endChapter,
    endBook,
    versesLoaded: !!verses,
    versesCount: Object.keys(verses).length
  });

  // For simplicity, we'll only handle same-book, same-chapter ranges for now
  if (startBook === endBook && startChapter === endChapter) {
    for (let v = startVerse; v <= endVerse; v++) {
      const text = getVerseText(verses, startBook, startChapter, v);
      console.log(`Looking up verse: ${startBook} ${startChapter}:${v} =>`, text ? text.substring(0, 50) + "..." : "NOT FOUND");
      if (text) {
        result.push({
          verse: v,
          chapter: startChapter,
          book: startBook,
          text,
          displayRef: `${startBook} ${startChapter}:${v}`,
        });
      }
    }
  } else {
    // For cross-chapter references, just get the first verse for now
    const text = getVerseText(verses, startBook, startChapter, startVerse);
    console.log(`Looking up verse (cross-chapter): ${startBook} ${startChapter}:${startVerse} =>`, text ? text.substring(0, 50) + "..." : "NOT FOUND");
    if (text) {
      result.push({
        verse: startVerse,
        chapter: startChapter,
        book: startBook,
        text,
        displayRef: `${startBook} ${startChapter}:${startVerse}`,
      });
    }
  }

  console.log("getVersesForReference result:", result);
  return result;
}

/**
 * Create verse slides from detected references
 * Each verse becomes its own slide with two-line layout:
 * Line 1: Verse text
 * Line 2: Reference
 */
export async function createVerseSlidesFromReferences(
  references: DetectedReference[],
  translationId: string = BUILTIN_KJV_ID
): Promise<VerseSlide[]> {
  const slides: VerseSlide[] = [];

  for (const detected of references) {
    const verseData = await getVersesForReference(
      detected.reference,
      translationId
    );
    
    for (const verse of verseData) {
      slides.push({
        text: `${verse.text}\n${verse.displayRef}`,
        layout: "two-line",
        isAutoScripture: true,
        reference: verse.displayRef,
      });
    }
  }

  return slides;
}

/**
 * Process slides and insert scripture verses after slides that contain references
 * Returns a new array with scripture slides inserted
 */
export async function processTextWithBibleReferences(
  slides: Array<{ text: string; layout: LayoutType }>,
  insertScriptureSlides: boolean = true,
  translationId: string = BUILTIN_KJV_ID
): Promise<Array<{ text: string; layout: LayoutType; isAutoScripture?: boolean }>> {
  console.log("=== processTextWithBibleReferences called ===");
  console.log("insertScriptureSlides:", insertScriptureSlides);
  console.log("Number of slides to process:", slides.length);
  
  if (!insertScriptureSlides) {
    console.log("insertScriptureSlides is false, returning original slides");
    return slides;
  }

  await loadVerses(translationId); // Ensure verses are loaded
  console.log("Verses loaded successfully");
  
  const result: Array<{ text: string; layout: LayoutType; isAutoScripture?: boolean }> = [];

  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i];
    console.log(`Processing slide ${i + 1}:`, slide.text.substring(0, 100) + "...");
    
    // Add the original slide
    result.push({ ...slide });

    // Detect references in this slide
    const references = detectBibleReferences(slide.text);
    console.log(`Found ${references.length} references in slide ${i + 1}`);
    
    if (references.length > 0) {
      // Create verse slides and insert them after this slide
      const verseSlides = await createVerseSlidesFromReferences(
        references,
        translationId
      );
      console.log(`Created ${verseSlides.length} verse slides`);
      
      for (const verseSlide of verseSlides) {
        result.push({
          text: verseSlide.text,
          layout: verseSlide.layout,
          isAutoScripture: verseSlide.isAutoScripture,
        });
      }
    }
  }

  console.log(`Total slides after processing: ${result.length} (was ${slides.length})`);
  return result;
}
