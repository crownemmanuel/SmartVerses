# Tests

Unit and regression tests for ProAssist. Run with Vitest.

## Running tests

```bash
npm test          # run once
npm run test:watch   # watch mode
```

## Adding tests

1. **New test file**: Add a file under `tests/` matching `*.test.ts` (or under `src/` if you prefer co-located tests). Vitest picks up both `tests/**/*.test.ts` and `src/**/*.test.ts`.

2. **Structure**: Use `describe` / `it` from `vitest`. Import from `../src/...` (or `@/...` if you add path alias) so tests stay outside the app bundle.

3. **Fixtures**: Put JSON or other fixtures in `tests/fixtures/`. For large transcript samples you can copy your export there (e.g. `transcript-2026-01-29T21-12-35.json`) and reference it in a test; the overlap regression test already loads `transcript-overlap-sample.json`.

4. **Pure logic**: Prefer testing pure functions (e.g. `src/utils/transcriptionOverlap.ts`) so tests run fast and need no mocks. For code that depends on Tauri or DOM, mock the dependencies or add integration tests later.

## Current test suites

- **transcriptionOverlap.test.ts** – Overlap removal used by Offline Whisper (and Mac native): `normalizeOverlapText`, `extractNewTranscriptionText`, and a regression run over a fixture transcript to ensure duplicate segments are reduced.
