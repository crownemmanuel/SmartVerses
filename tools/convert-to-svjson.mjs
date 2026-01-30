#!/usr/bin/env node
/**
 * Converts a JSON Bible file (KJV-style: books -> book -> chapter -> verse -> string)
 * into ProAssist .svjson format (metadata + books with verses as { v, t }).
 * Saves the result in the same directory as the input file, or in --out-dir if given.
 *
 * Usage: node tools/convert-to-svjson.mjs [path/to/input.json]
 *        If no path is given, the script will prompt for it.
 *
 * Non-interactive (all optional except --short-name and --full-name):
 *   node tools/convert-to-svjson.mjs path/to/input.json --out-dir path/to/svbibles \\
 *     --short-name KJV --full-name "King James Version" --language en \\
 *     [--id kjv] [--source "Public Domain"] [--aliases "KJV, King James"]
 */

import { createInterface } from "readline";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { resolve, dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const args = { positional: [] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) {
      const key = argv[i].slice(2).replace(/-/g, "");
      const value = argv[i + 1];
      if (value !== undefined && !value.startsWith("--")) {
        args[key] = value;
        i++;
      } else {
        args[key] = true;
      }
    } else {
      args.positional.push(argv[i]);
    }
  }
  return args;
}

const rl = createInterface({ input: process.stdin, output: process.stdout });

function ask(question, defaultValue = "") {
  const prompt = defaultValue ? `${question} [${defaultValue}]: ` : `${question}: `;
  return new Promise((resolveAnswer) => {
    rl.question(prompt, (answer) => {
      const trimmed = (answer ?? "").trim();
      resolveAnswer(trimmed !== "" ? trimmed : defaultValue);
    });
  });
}

function askRequired(question, fieldName) {
  return new Promise((resolveAnswer) => {
    const askOnce = () => {
      rl.question(`${question}: `, (answer) => {
        const trimmed = (answer ?? "").trim();
        if (trimmed === "") {
          console.log(`${fieldName} cannot be blank.`);
          askOnce();
        } else {
          resolveAnswer(trimmed);
        }
      });
    };
    askOnce();
  });
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Convert input books (verse value = string) to SV JSON books (verse value = { v, t }).
 */
function convertBooks(inputBooks) {
  const books = {};
  for (const [bookName, chapters] of Object.entries(inputBooks)) {
    if (!isRecord(chapters)) continue;
    books[bookName] = {};
    for (const [chapterKey, verses] of Object.entries(chapters)) {
      if (!isRecord(verses)) continue;
      books[bookName][chapterKey] = {};
      for (const [verseKey, verseValue] of Object.entries(verses)) {
        const verseNum = parseInt(verseKey, 10);
        const text =
          typeof verseValue === "string"
            ? verseValue
            : isRecord(verseValue) && typeof verseValue.t === "string"
              ? verseValue.t
              : String(verseValue ?? "");
        books[bookName][chapterKey][verseKey] = {
          v: Number.isFinite(verseNum) ? verseNum : 0,
          t: text,
        };
      }
    }
  }
  return books;
}

function main() {
  const argv = process.argv.slice(2);
  const args = parseArgs(argv);
  const inputPathArg = args.positional[0];
  let inputPath = inputPathArg ? resolve(process.cwd(), inputPathArg) : null;
  const nonInteractive =
    args.shortname != null &&
    args.shortname !== "" &&
    args.fullname != null &&
    args.fullname !== "";

  (async () => {
    try {
      if (!inputPath) {
        const pathAnswer = await ask("Path to input JSON file");
        if (!pathAnswer) {
          console.error("No input path given. Exiting.");
          rl.close();
          process.exit(1);
        }
        inputPath = resolve(process.cwd(), pathAnswer.trim());
      }

      const rawContent = readFileSync(inputPath, "utf-8");
      const input = JSON.parse(rawContent);

      const hasBooks = isRecord(input.books);
      const rawBooks = hasBooks ? input.books : input;
      if (!isRecord(rawBooks)) {
        console.error("Input JSON must have a 'books' object (or be the books object itself).");
        rl.close();
        process.exit(1);
      }

      let shortName, fullName, id, language, source, aliases;

      if (nonInteractive) {
        shortName = String(args.shortname).trim();
        fullName = String(args.fullname).trim();
        const defaultId =
          (input.id && typeof input.id === "string" ? input.id : "").trim() ||
          shortName.toLowerCase().replace(/\s+/g, "-");
        id = (args.id != null ? String(args.id).trim() : defaultId) || defaultId;
        language = (args.language != null ? String(args.language).trim() : "") || (input.language && typeof input.language === "string" ? input.language : "") || "";
        source = (args.source != null ? String(args.source).trim() : "") || (input.source && typeof input.source === "string" ? input.source : "") || undefined;
        const aliasesStr = args.aliases != null ? String(args.aliases) : Array.isArray(input.aliases) ? input.aliases.join(", ") : "";
        aliases =
          aliasesStr
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
        aliases = aliases.length > 0 ? aliases : undefined;
      } else {
        console.log("\nEnter metadata. Short name and full name are required; others may be blank.\n");
        shortName = await askRequired("Short name (e.g. KJV)", "Short name");
        fullName = await askRequired("Full name (e.g. King James Version)", "Full name");
        id = await ask("ID (e.g. kjv)", (input.id && typeof input.id === "string" ? input.id : "").trim() || shortName.toLowerCase().replace(/\s+/g, "-"));
        language = await ask("Language (e.g. en)", (input.language && typeof input.language === "string" ? input.language : "").trim() || "");
        source = await ask("Source (e.g. Public Domain)", (input.source && typeof input.source === "string" ? input.source : "").trim() || "");
        const aliasesStr = await ask("Aliases (comma-separated)", Array.isArray(input.aliases) ? input.aliases.join(", ") : "");
        aliases =
          aliasesStr
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean) || undefined;
      }

      const books = convertBooks(rawBooks);

      const output = {
        id: id || shortName.toLowerCase().replace(/\s+/g, "-"),
        shortName,
        fullName,
        language: language || "",
        source: source || undefined,
        aliases: aliases && aliases.length > 0 ? aliases : undefined,
        books,
      };

      const outDir = args.outdir ? resolve(process.cwd(), args.outdir) : dirname(inputPath);
      try {
        mkdirSync(outDir, { recursive: true });
      } catch (_) {}
      const inputBase = inputPath.split(/[/\\]/).pop() || "output";
      const nameWithoutExt = inputBase.replace(/\.[^.]+$/, "") || inputBase;
      const outputPath = join(outDir, `${nameWithoutExt}.svjson`);

      writeFileSync(outputPath, JSON.stringify(output, null, 2), "utf-8");
      console.log(`\nWrote: ${outputPath}`);
    } catch (err) {
      console.error(err.message || err);
      process.exit(1);
    } finally {
      rl.close();
    }
  })();
}

main();
