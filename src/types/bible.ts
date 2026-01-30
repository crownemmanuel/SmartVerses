export interface BibleTranslationMetadata {
  id: string;
  shortName: string;
  fullName: string;
  language: string;
  source?: string;
  aliases?: string[];
}

export interface BibleVerseEntry {
  v: number;
  t: string;
}

export type BibleVerseValue = BibleVerseEntry | string;

export type BibleBooks = Record<
  string,
  Record<string, Record<string, BibleVerseValue>>
>;

export interface BibleTranslationFile extends BibleTranslationMetadata {
  books: BibleBooks;
}

export interface BibleTranslation extends BibleTranslationMetadata {
  books: BibleBooks;
  verseIndex: Record<string, string>;
  isBuiltin: boolean;
  sourcePath?: string;
}

export interface BibleTranslationSummary extends BibleTranslationMetadata {
  isBuiltin: boolean;
  sourcePath?: string;
}
