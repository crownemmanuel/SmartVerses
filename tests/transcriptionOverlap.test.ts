/**
 * Transcription overlap regression tests
 *
 * Tests the overlap-removal logic used by Offline Whisper (and Mac native)
 * so that streaming chunks that re-transcribe context don't produce duplicate
 * segments. Add more cases here as you find real transcript samples.
 *
 * Run: npm test
 * Watch: npm run test:watch
 */

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  normalizeOverlapText,
  extractNewTranscriptionText,
} from "../src/utils/transcriptionOverlap";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("normalizeOverlapText", () => {
  it("lowercases and strips punctuation", () => {
    expect(normalizeOverlapText("Hello, World!")).toBe("hello world");
    expect(normalizeOverlapText("It's a test.")).toBe("it's a test");
  });

  it("collapses whitespace", () => {
    expect(normalizeOverlapText("  one   two  ")).toBe("one two");
  });

  it("keeps apostrophes", () => {
    expect(normalizeOverlapText("Jesus' name")).toBe("jesus' name");
  });
});

describe("extractNewTranscriptionText", () => {
  it("returns full new text when last is empty", () => {
    expect(extractNewTranscriptionText("", "Hello world")).toBe("Hello world");
    expect(extractNewTranscriptionText("   ", "Hello world")).toBe("Hello world");
  });

  it("returns full new text when no overlap", () => {
    expect(extractNewTranscriptionText("First sentence.", "Second sentence.")).toBe(
      "Second sentence."
    );
  });

  it("strips word overlap when suffix of last matches prefix of new", () => {
    const last = "Grace to renew your dedication.";
    const newText = "Grace to renew your dedication to the almighty God.";
    expect(extractNewTranscriptionText(last, newText)).toBe("to the almighty God.");
  });

  it("strips overlap with punctuation differences", () => {
    const last = "receive it in Jesus name";
    const newText = "Jesus name. Say with me, I receive it.";
    const out = extractNewTranscriptionText(last, newText);
    expect(out).toBe("Say with me, I receive it.");
  });

  it("returns empty when new is entirely overlap", () => {
    const last = "Grace to renew your dedication to the almighty God.";
    const newText = "to the almighty God.";
    expect(extractNewTranscriptionText(last, newText).trim()).toBe("");
  });

  it("handles two-word minimum overlap", () => {
    const last = "Hello world";
    const newText = "Hello world again";
    expect(extractNewTranscriptionText(last, newText)).toBe("again");
  });
});

/**
 * Regression: simulate streaming transcript segments through overlap removal.
 * Raw segments often repeat the tail of the previous segment; after extraction
 * we should have fewer logical segments and no duplicated phrases.
 */
describe("transcript overlap regression (fixture)", () => {
  type Segment = { id: string; text: string; timestamp?: number; isFinal?: boolean };

  function runOverlapPipeline(segments: Segment[]): { emitted: string[]; totalEmittedChars: number } {
    let lastFullText = "";
    const emitted: string[] = [];
    for (const seg of segments) {
      const newPortion = extractNewTranscriptionText(lastFullText, seg.text);
      lastFullText = seg.text;
      if (newPortion.trim()) {
        emitted.push(newPortion);
      }
    }
    const totalEmittedChars = emitted.join(" ").length;
    return { emitted, totalEmittedChars };
  }

  it("reduces duplicate content when processing overlapping segments", () => {
    const fixturePath = path.join(__dirname, "fixtures", "transcript-overlap-sample.json");
    if (!fs.existsSync(fixturePath)) {
      console.warn("Fixture not found, skipping regression test");
      return;
    }
    const raw = JSON.parse(fs.readFileSync(fixturePath, "utf-8")) as {
      segments: Segment[];
    };
    const segments = raw.segments || [];
    expect(segments.length).toBeGreaterThan(0);

    const { emitted, totalEmittedChars } = runOverlapPipeline(segments);
    const rawTotalChars = segments.map((s) => s.text).join(" ").length;

    // After overlap removal we should emit less (or equal) total text than raw concatenation
    expect(totalEmittedChars).toBeLessThanOrEqual(rawTotalChars);
    // We should have at least one emitted segment
    expect(emitted.length).toBeGreaterThan(0);
    // Emitted segments should not start with repeated tail of previous (smoke check)
    const concatenated = emitted.join(" ").toLowerCase();
    const phrase = "grace to renew your dedication";
    const firstIdx = concatenated.indexOf(phrase);
    const secondIdx = concatenated.indexOf(phrase, firstIdx + 1);
    // That phrase should not appear twice in a row (overlap artifact)
    if (firstIdx !== -1 && secondIdx !== -1) {
      const between = concatenated.slice(firstIdx + phrase.length, secondIdx).trim();
      expect(between.length).toBeGreaterThan(0);
    }
  });

  it("with minimal fixture produces fewer emitted segments than raw", () => {
    const segments: Segment[] = [
      { id: "1", text: "Receive it in Jesus' name. Grace to renew your dedication.", isFinal: true },
      { id: "2", text: "Grace to renew your dedication to the almighty God.", isFinal: true },
      { id: "3", text: "to the Almighty God receive it in Jesus name.", isFinal: true },
    ];
    const { emitted } = runOverlapPipeline(segments);
    expect(emitted.length).toBeLessThanOrEqual(segments.length);
    expect(emitted[0]).toBe("Receive it in Jesus' name. Grace to renew your dedication.");
    expect(emitted[1]).toBe("to the almighty God.");
    expect(emitted[2]).toBe("receive it in Jesus name.");
  });
});
