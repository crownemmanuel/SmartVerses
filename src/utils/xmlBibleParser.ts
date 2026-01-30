import type { BibleBooks, BibleVerseEntry } from "../types/bible";

const BIBLE_BOOKS = [
  "Genesis",
  "Exodus",
  "Leviticus",
  "Numbers",
  "Deuteronomy",
  "Joshua",
  "Judges",
  "Ruth",
  "1 Samuel",
  "2 Samuel",
  "1 Kings",
  "2 Kings",
  "1 Chronicles",
  "2 Chronicles",
  "Ezra",
  "Nehemiah",
  "Esther",
  "Job",
  "Psalms",
  "Proverbs",
  "Ecclesiastes",
  "Song of Solomon",
  "Isaiah",
  "Jeremiah",
  "Lamentations",
  "Ezekiel",
  "Daniel",
  "Hosea",
  "Joel",
  "Amos",
  "Obadiah",
  "Jonah",
  "Micah",
  "Nahum",
  "Habakkuk",
  "Zephaniah",
  "Haggai",
  "Zechariah",
  "Malachi",
  "Matthew",
  "Mark",
  "Luke",
  "John",
  "Acts",
  "Romans",
  "1 Corinthians",
  "2 Corinthians",
  "Galatians",
  "Ephesians",
  "Philippians",
  "Colossians",
  "1 Thessalonians",
  "2 Thessalonians",
  "1 Timothy",
  "2 Timothy",
  "Titus",
  "Philemon",
  "Hebrews",
  "James",
  "1 Peter",
  "2 Peter",
  "1 John",
  "2 John",
  "3 John",
  "Jude",
  "Revelation",
];

function getBookNameByNumber(bookNumber: number): string | null {
  const index = bookNumber - 1;
  if (index >= 0 && index < BIBLE_BOOKS.length) {
    return BIBLE_BOOKS[index];
  }
  return null;
}

export interface XmlBibleMetadata {
  translation?: string;
  language?: string;
}

/**
 * Extract metadata from XML Bible file
 */
export function extractXmlBibleMetadata(xmlText: string): XmlBibleMetadata {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, "text/xml");

  // Check for parsing errors
  const parserError = doc.querySelector("parsererror");
  if (parserError) {
    throw new Error(
      `XML parsing error: ${parserError.textContent || "Invalid XML format"}`
    );
  }

  const bibleElement = doc.querySelector("bible");
  if (!bibleElement) {
    throw new Error("No <bible> root element found in XML");
  }

  const metadata: XmlBibleMetadata = {};
  
  // Extract translation attribute
  const translation = bibleElement.getAttribute("translation");
  if (translation) {
    metadata.translation = translation.trim();
  }

  // Try to infer language from translation name (e.g., "English NIV" -> "en")
  if (metadata.translation) {
    const lowerTranslation = metadata.translation.toLowerCase();
    if (lowerTranslation.includes("english") || lowerTranslation.startsWith("en")) {
      metadata.language = "en";
    } else if (lowerTranslation.includes("spanish") || lowerTranslation.startsWith("es")) {
      metadata.language = "es";
    } else if (lowerTranslation.includes("french") || lowerTranslation.startsWith("fr")) {
      metadata.language = "fr";
    } else if (lowerTranslation.includes("german") || lowerTranslation.startsWith("de")) {
      metadata.language = "de";
    } else if (lowerTranslation.includes("portuguese") || lowerTranslation.startsWith("pt")) {
      metadata.language = "pt";
    } else if (lowerTranslation.includes("chinese") || lowerTranslation.startsWith("zh")) {
      metadata.language = "zh";
    } else if (lowerTranslation.includes("japanese") || lowerTranslation.startsWith("ja")) {
      metadata.language = "ja";
    } else if (lowerTranslation.includes("korean") || lowerTranslation.startsWith("ko")) {
      metadata.language = "ko";
    } else if (lowerTranslation.includes("arabic") || lowerTranslation.startsWith("ar")) {
      metadata.language = "ar";
    } else if (lowerTranslation.includes("hindi") || lowerTranslation.startsWith("hi")) {
      metadata.language = "hi";
    }
  }

  return metadata;
}

/**
 * Parse XML Bible format into BibleBooks structure
 * Expected format:
 * <bible translation="...">
 *   <testament name="...">
 *     <book number="1">
 *       <chapter number="1">
 *         <verse number="1">text</verse>
 *       </chapter>
 *     </book>
 *   </testament>
 * </bible>
 */
export function parseXmlBible(xmlText: string): {
  books: BibleBooks;
  bookCount: number;
} {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, "text/xml");

  // Check for parsing errors
  const parserError = doc.querySelector("parsererror");
  if (parserError) {
    throw new Error(
      `XML parsing error: ${parserError.textContent || "Invalid XML format"}`
    );
  }

  const bibleElement = doc.querySelector("bible");
  if (!bibleElement) {
    throw new Error("No <bible> root element found in XML");
  }

  const books: BibleBooks = {};
  let bookCount = 0;

  // Find all book elements
  const bookElements = doc.querySelectorAll("book");
  if (bookElements.length === 0) {
    throw new Error("No <book> elements found in XML");
  }

  for (const bookElement of bookElements) {
    const bookNumberAttr = bookElement.getAttribute("number");
    if (!bookNumberAttr) {
      console.warn("Book element missing number attribute, skipping");
      continue;
    }

    const bookNumber = parseInt(bookNumberAttr, 10);
    if (isNaN(bookNumber)) {
      console.warn(`Invalid book number: ${bookNumberAttr}, skipping`);
      continue;
    }

    const bookName = getBookNameByNumber(bookNumber);
    if (!bookName) {
      console.warn(`Unknown book number: ${bookNumber}, skipping`);
      continue;
    }

    // Skip if we already have this book (shouldn't happen, but be safe)
    if (books[bookName]) {
      console.warn(`Duplicate book: ${bookName}, skipping`);
      continue;
    }

    books[bookName] = {};
    bookCount++;

    // Process chapters
    const chapterElements = bookElement.querySelectorAll("chapter");
    for (const chapterElement of chapterElements) {
      const chapterNumberAttr = chapterElement.getAttribute("number");
      if (!chapterNumberAttr) {
        console.warn(
          `Chapter element missing number attribute in ${bookName}, skipping`
        );
        continue;
      }

      const chapterNumber = parseInt(chapterNumberAttr, 10);
      if (isNaN(chapterNumber)) {
        console.warn(
          `Invalid chapter number: ${chapterNumberAttr} in ${bookName}, skipping`
        );
        continue;
      }

      const chapterKey = String(chapterNumber);
      books[bookName][chapterKey] = {};

      // Process verses
      const verseElements = chapterElement.querySelectorAll("verse");
      for (const verseElement of verseElements) {
        const verseNumberAttr = verseElement.getAttribute("number");
        if (!verseNumberAttr) {
          console.warn(
            `Verse element missing number attribute in ${bookName} ${chapterNumber}, skipping`
          );
          continue;
        }

        const verseNumber = parseInt(verseNumberAttr, 10);
        if (isNaN(verseNumber)) {
          console.warn(
            `Invalid verse number: ${verseNumberAttr} in ${bookName} ${chapterNumber}, skipping`
          );
          continue;
        }

        const verseText = verseElement.textContent?.trim() || "";
        if (!verseText) {
          console.warn(
            `Empty verse text for ${bookName} ${chapterNumber}:${verseNumber}, skipping`
          );
          continue;
        }

        const verseKey = String(verseNumber);
        const entry: BibleVerseEntry = {
          v: verseNumber,
          t: verseText,
        };
        books[bookName][chapterKey][verseKey] = entry;
      }
    }
  }

  if (bookCount === 0) {
    throw new Error("No valid books found in XML");
  }

  return { books, bookCount };
}
