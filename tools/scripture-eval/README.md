# Scripture Eval Runner

Runs Groq extraction and local parser validation against transcript JSON files.

## Requirements

- Node 18+
- `GROQ_API_KEY` set in your environment for Groq calls

## Example

```bash
node tools/scripture-eval/run.mjs --input "/Users/emmanuelcrown/Downloads/1ST_Service__Prophet_1080 (1)_1.json" --mode both --delay-ms 250
```

## Outputs

- `*.groq.jsonl`: Groq detection per chunk
- `*.failed.jsonl`: Only failures comparing local parser vs Groq

## Options

- `--mode groq|parse|both` (default: both)
- `--groq-out /path/file.jsonl` (supports legacy `--grok-out`)
- `--groq-results /path/file.jsonl` (for parse-only mode; supports legacy `--grok-results`)
- `--failures-out /path/file.jsonl`
- `--parse-out /path/file.jsonl` (optional full parse results)
- `--start N`, `--limit N`
- `--delay-ms N`, `--retries N`
- `--verses /path/to/kjv.svjson` (default: `public/data/bibles/kjv.svjson`)

## Notes

- The local parser code is copied from `src/services/smartVersesBibleService.ts`.
- If you update the parser in the app, copy those changes into `tools/scripture-eval/run.mjs` to keep the evaluation consistent.
