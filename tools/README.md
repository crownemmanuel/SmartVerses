# ProAssist Tools

Scripts and utilities used for Bible data and evaluation. All tools run with Node 18+ and use ES modules (`.mjs`).

---

## convert-to-svjson

Converts a JSON Bible file (KJV-style layout) into ProAssist’s **.svjson** format so it can be used by the app’s Bible library and Smart Verses.

### What it does

- **Input:** A JSON file where the Bible is structured as:
  - `books` → book name → chapter number/key → verse number/key → **verse text (string)**  
  - Or the root object is the books map itself.
- **Output:** A single `.svjson` file with:
  - **Metadata:** `id`, `shortName`, `fullName`, `language`, optional `source`, optional `aliases`
  - **Books:** Same book/chapter/verse structure, but each verse is normalized to `{ v: number, t: string }` (verse number and text)

So the tool both normalizes verse shape and adds/edits metadata for the translation.

### Input format

Expected input shape (conceptually):

```json
{
  "books": {
    "Genesis": {
      "1": {
        "1": "In the beginning God created the heaven and the earth.",
        "2": "And the earth was without form..."
      },
      "2": { ... }
    },
    "Exodus": { ... }
  }
}
```

- Top level can be `{ "books": { ... } }` or just the books object.
- Verse values can be:
  - A **string** (plain text), or
  - An object with a **`t`** property (e.g. `{ "t": "In the beginning..." }`).  
  In both cases the script produces `{ v, t }` in the output.

### Output format (.svjson)

```json
{
  "id": "kjv",
  "shortName": "KJV",
  "fullName": "King James Version",
  "language": "en",
  "source": "Public Domain",
  "aliases": ["KJV", "King James"],
  "books": {
    "Genesis": {
      "1": {
        "1": { "v": 1, "t": "In the beginning God created..." },
        "2": { "v": 2, "t": "And the earth was without form..." }
      }
    }
  }
}
```

This matches `BibleTranslationFile` in `src/types/bible.ts`.

### Usage

**Interactive (prompts for input path and metadata):**

```bash
node tools/convert-to-svjson.mjs
# then enter path and short name, full name, id, language, source, aliases when asked
```

**Non-interactive (all required metadata via flags):**

```bash
node tools/convert-to-svjson.mjs path/to/input.json \
  --out-dir path/to/svbibles \
  --short-name KJV \
  --full-name "King James Version" \
  --language en
```

Optional flags (can be omitted and will fall back to input file or defaults):

- `--id kjv` — translation id (default: derived from short name)
- `--source "Public Domain"`
- `--aliases "KJV, King James"`

Output is written to:

- `--out-dir path` → `path/<input-basename>.svjson`
- No `--out-dir` → same directory as the input file, `<input-basename>.svjson`

### Requirements

- Node 18+
- Input must be valid JSON with a book/chapter/verse structure as above.

### Example (full run)

```bash
node tools/convert-to-svjson.mjs ./my-bible.json \
  --out-dir ./svbibles \
  --short-name ESV \
  --full-name "English Standard Version" \
  --language en \
  --id esv \
  --source "Crossway" \
  --aliases "ESV, English Standard"
```

This produces `svbibles/my-bible.svjson` ready to use with the app’s Bible library (e.g. under `public/data/bibles/` or via import).

---

## scripture-eval

Runs Groq-based extraction and local parser validation on transcript JSON files. Used to evaluate and tune Smart Verses detection.

See **[tools/scripture-eval/README.md](scripture-eval/README.md)** for:

- Requirements (Node 18+, `GROQ_API_KEY`)
- Usage and options (`--mode`, `--input`, outputs, etc.)
- How it relates to `src/services/smartVersesBibleService.ts`
