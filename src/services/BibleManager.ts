
import { exists, mkdir, readDir, readTextFile, BaseDirectory } from '@tauri-apps/plugin-fs';

export interface BibleVerse {
    v: number;
    t: string;
}

export interface BibleChapter {
    verses: BibleVerse[];
}

export interface BibleBook {
    name: string;
    chapters: BibleChapter[];
}

export interface BibleMetadata {
    id: string; // Unique translation identifier (e.g. gnt)
    shortName: string; // Short label for UI (e.g. GNT)
    fullName: string; // Full translation name (e.g. Good News Translation)
    language: string; // Language code (e.g. en)
    source?: string; // Source or licensing notes
    aliases?: string[]; // Alternate names
}

export interface BibleData extends BibleMetadata {
    books: Record<string, any>; // Used to be rigid schema, but let's be flexible to validate content
    // books structure is what we need to traverse to flatten or use
}

// Internal representation for the app
export interface BibleTranslation {
    id: string;
    name: string;
    source: 'built-in' | 'user';
    data?: Record<string, string>; // Flattened "Genesis 1:1" -> "In the beginning..."
    filePath?: string;
    metadata?: BibleMetadata;
}

class BibleManager {
    private bibles: Map<string, BibleTranslation> = new Map();
    private selectedTranslationId: string = 'kjv';
    private listeners: (() => void)[] = [];
    private initialized = false;

    constructor() {
        // Initialize with minimal KJV metadata
        this.bibles.set('kjv', {
            id: 'kjv',
            name: 'King James Version',
            source: 'built-in'
        });
    }

    async initialize() {
        if (this.initialized) return;
        
        // Load built-in KJV data
        try {
            const response = await fetch("/data/verses-kjv.json");
            if (response.ok) {
                const data = await response.json();
                const kjv = this.bibles.get('kjv')!;
                kjv.data = data;
                this.bibles.set('kjv', kjv);
            } else {
                console.error("Failed to load built-in KJV");
            }
        } catch (e) {
            console.error("Error loading built-in KJV:", e);
        }

        await this.loadUserBibles();
        this.initialized = true;
        this.notifyListeners();
    }

    async loadUserBibles() {
        try {
            // Create directory if it doesn't exist
            try {
               await mkdir('ProAssist/Bibles', {             
                   baseDir: BaseDirectory.Document,
                   recursive: true 
               });
            } catch (ignore) {
                // Ignore if it already exists or other non-critical errors
            }

            const entries = await readDir('ProAssist/Bibles', { baseDir: BaseDirectory.Document });

            for (const entry of entries) {
                if (entry.isFile && entry.name.endsWith('.svjson')) {
                   try {
                       const content = await readTextFile(`ProAssist/Bibles/${entry.name}`, { 
                           baseDir: BaseDirectory.Document 
                       });
                       
                       let bibleData: any;
                       try {
                         bibleData = JSON.parse(content);
                       } catch(e) {
                         console.error(`Invalid JSON in ${entry.name}`);
                         continue;
                       }

                       // Validate Metadata
                       if (!this.validateMetadata(bibleData)) {
                           console.warn(`Skipping ${entry.name}: Missing required metadata (id, shortName, fullName, language, source, aliases)`);
                           continue;
                       }
                       
                       const id = bibleData.id.toLowerCase();
                       // Don't overwrite built-in KJV
                       if (id === 'kjv') {
                           console.warn(`Skipping ${entry.name}: Cannot overwrite built-in KJV`);
                           continue;
                       }
                       
                       // Validate Structure & Flatten
                        const flattenedData = this.validateAndFlattenBible(bibleData);
                        if (!flattenedData) {
                            console.warn(`Skipping ${entry.name}: Invalid structure (books/chapters/verses schema mismatch)`);
                            continue;
                        }

                       this.bibles.set(id, {
                           id: id,
                           name: bibleData.shortName,
                           source: 'user',
                           data: flattenedData,
                           metadata: {
                               id: bibleData.id,
                               shortName: bibleData.shortName,
                               fullName: bibleData.fullName,
                               language: bibleData.language,
                               source: bibleData.source,
                               aliases: bibleData.aliases
                           }
                       });
                   } catch (err) {
                       console.warn(`Failed to load bible ${entry.name}`, err);
                   }
                }
            }
            this.notifyListeners();
        } catch (err) {
            console.error("Error loading user bibles:", err);
        }
    }

    private validateMetadata(data: any): boolean {
        // Required fields: id, shortName, fullName, language
        // Optional fields: source, aliases
        
        const hasIds = typeof data.id === 'string' && data.id.length > 0;
        const hasShortName = typeof data.shortName === 'string' && data.shortName.length > 0;
        const hasFullName = typeof data.fullName === 'string' && data.fullName.length > 0;
        const hasLanguage = typeof data.language === 'string' && data.language.length > 0;

        // Check optional fields only if they are present (must be correct type if present)
        let validOptional = true;
        if (data.source !== undefined && typeof data.source !== 'string') validOptional = false;
        if (data.aliases !== undefined && !Array.isArray(data.aliases)) validOptional = false;

        if (!hasIds || !hasShortName || !hasFullName || !hasLanguage || !validOptional) {
             const missing = [];
             if (!hasIds) missing.push('id');
             if (!hasShortName) missing.push('shortName');
             if (!hasFullName) missing.push('fullName');
             if (!hasLanguage) missing.push('language');
             if (!validOptional) missing.push('source (must be string) or aliases (must be array)');
             
             console.warn(`Validation failed. Missing or invalid metadata fields: ${missing.join(', ')}`);
             return false;
        }

        return true;
    }

    private validateAndFlattenBible(data: any): Record<string, string> | null {
        // Expected structure based on provided example:
        // {
        //   ...metadata,
        //   "books": {
        //     "Genesis": {
        //       "1": {
        //         "1": "In the beginning...",
        //         "2": "And the earth..."
        //       }
        //     }
        //   }
        // }
        
        if (!data.books || typeof data.books !== 'object' || Array.isArray(data.books)) {
             console.warn("Bible structure 'books' must be an object/dictionary.");
             return null;
        }

        const flattened: Record<string, string> = {};
        
        // Structure: books[BookName][ChapterNum][VerseNum] = Text
        
        for (const [bookName, chapters] of Object.entries(data.books)) {
            if (typeof chapters !== 'object' || chapters === null) continue;

            for (const [chapterNum, verses] of Object.entries(chapters as Record<string, any>)) {
                if (typeof verses !== 'object' || verses === null) continue;

                // Check if verses is object ({"1": "Text"}) or array ([{v:1, t:"Text"}])
                // The provided image shows object: "1": "Text".
                
                if (Array.isArray(verses)) {
                     // Fallback for Array format if ever needed, but image shows object
                     continue;
                } else {
                     // Object format: "1": "Text"
                     for (const [verseNum, text] of Object.entries(verses as Record<string, any>)) {
                         if (typeof text === 'string') {
                             const ref = `${bookName} ${chapterNum}:${verseNum}`;
                             flattened[ref] = text;
                         } else if (typeof text === 'object' && text.t) {
                              // Support object with .t property just in case
                             const ref = `${bookName} ${chapterNum}:${verseNum}`;
                             flattened[ref] = text.t;
                         }
                     }
                }
            }
        }

        // Just basic validation: did we get any verses?
        if (Object.keys(flattened).length === 0) {
             console.warn("No verses found in flattened data.");
             return null;
        }

        return flattened;
    }

    getTranslation(id: string): BibleTranslation | undefined {
        return this.bibles.get(id);
    }

    getCurrentTranslation(): BibleTranslation {
        return this.bibles.get(this.selectedTranslationId) || this.bibles.get('kjv')!;
    }

    setTranslation(id: string) {
        if (this.bibles.has(id)) {
            this.selectedTranslationId = id;
            this.notifyListeners();
        } else {
             // Fallback to KJV if invalid ID
             this.selectedTranslationId = 'kjv';
             this.notifyListeners();
        }
    }

    getAllTranslations(): BibleTranslation[] {
        return Array.from(this.bibles.values());
    }

    subscribe(listener: () => void) {
        this.listeners.push(listener);
        return () => {
            this.listeners = this.listeners.filter(l => l !== listener);
        };
    }

    private notifyListeners() {
        this.listeners.forEach(l => l());
    }
}

export const bibleManager = new BibleManager();
