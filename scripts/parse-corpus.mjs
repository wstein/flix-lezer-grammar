#!/usr/bin/env node
// Parses every `.flix` file in the pinned upstream checkout and reports the ones this grammar
// cannot read cleanly.
//
// The fixture suite is 116 curated files; this is 874 files of real Flix, which is the only thing
// that finds the constructs nobody thought to write a fixture for. What counts as "cannot read" is
// the same rule the fixture tests use: a tree carrying an error node, since Lezer always produces
// a tree and a clean-looking one proves nothing on its own.
//
// The checkout is verified by git tree hash against `corpus/corpus.json` from flix-spec, so this
// measures the same 874 files the reference was measured against and not whatever master is today.
//
// Usage:
//   npm run corpus                  # fetch if absent, parse, report
//   node scripts/parse-corpus.mjs --json report.json
//   node scripts/parse-corpus.mjs --limit 50       # a quick pass while iterating

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const corpusDir = join(root, ".corpus");
const specCorpus = join(root, ".spec", "corpus", "corpus.json");
const built = join(root, "dist", "index.js");

/**
 * Files the reference parser does not accept either, so failing on them is correct. Each needs a
 * reason that is about the file rather than about this grammar.
 */
const NOT_VALID_FLIX = new Map([
  [
    "main/test/flix/resiliency/ford-fulkerson-prefix.flix",
    "an intentional negative test, truncated mid-expression to exercise error recovery",
  ],
  [
    "examples/apps/langcensus/src/Analyse.flix",
    "uses `foreach (...) yield e`, which Parser2.foreachExpr (Parser2.scala:2425) has no " +
      "production for -- unlike forA and forM. The reference rejects this file too",
  ],
]);

const USAGE = `usage: parse-corpus [--limit N] [--json PATH]

  --limit N    parse only the first N files, for a quick pass while iterating
  --json PATH  write the full result, including every failure, to PATH`;

function fail(message) {
  console.error(`${message}\n\n${USAGE}`);
  process.exit(2);
}

/** Rejects an unknown or incomplete option up front rather than at the point it is first used. */
function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--limit") {
      const value = Number(argv[++i]);
      if (!Number.isInteger(value) || value < 1) fail(`--limit needs a positive integer`);
      options.limit = value;
    } else if (arg === "--json") {
      const value = argv[++i];
      if (!value || value.startsWith("--")) fail("--json needs a path");
      options.json = value;
    } else {
      fail(`unknown argument: ${arg}`);
    }
  }
  return options;
}

function git(args, cwd) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function ensureCheckout(commit, treeHash) {
  if (!existsSync(join(corpusDir, ".git"))) {
    mkdirSync(corpusDir, { recursive: true });
    git(["init", "--quiet"], corpusDir);
    git(["remote", "add", "origin", "https://github.com/flix/flix.git"], corpusDir);
  }
  let head;
  try {
    head = git(["rev-parse", "HEAD"], corpusDir).trim();
  } catch {
    head = ""; // No HEAD yet: a fresh `git init`, so there is nothing checked out to compare.
  }
  if (head !== commit) {
    console.error(`fetching flix ${commit.slice(0, 8)} — this takes a minute the first time`);
    git(["fetch", "--quiet", "--depth", "1", "origin", commit], corpusDir);
    git(["checkout", "--quiet", "--force", commit], corpusDir);
  }

  const actual = git(["rev-parse", `${commit}^{tree}`], corpusDir).trim();
  if (actual !== treeHash) {
    console.error(`FATAL: tree hash mismatch\n  expected ${treeHash}\n  actual   ${actual}`);
    process.exit(1);
  }
}

function flixFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (entry === ".git") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...flixFiles(full));
    else if (entry.endsWith(".flix")) out.push(full);
  }
  return out;
}

/** The first error node in a tree, as a line number and the text around it. */
function firstError(tree, source) {
  const cursor = tree.cursor();
  do {
    if (cursor.type.isError) {
      const line = source.slice(0, cursor.from).split("\n").length;
      const start = source.lastIndexOf("\n", cursor.from) + 1;
      let end = source.indexOf("\n", cursor.from);
      if (end < 0) end = source.length;
      return { line, text: source.slice(start, end).trim().slice(0, 90) };
    }
  } while (cursor.next());
  return null;
}

async function main() {
  if (!existsSync(built)) {
    console.error("FATAL: dist/ is missing — run `npm run build` first");
    process.exit(1);
  }
  if (!existsSync(specCorpus)) {
    console.error("FATAL: .spec/ is missing — run `npm run fetch-spec` first");
    process.exit(1);
  }

  const { upstream, counts } = JSON.parse(readFileSync(specCorpus, "utf8"));
  ensureCheckout(upstream.commit, upstream.treeHash);

  const argv = process.argv.slice(2);
  const options = parseArgs(argv);

  const { parser } = await import(built);

  let files = flixFiles(corpusDir).sort();
  if (files.length !== counts.totalFlixFiles) {
    console.error(
      `FATAL: found ${files.length} .flix files, corpus.json says ${counts.totalFlixFiles}`,
    );
    process.exit(1);
  }
  if (options.limit !== undefined) files = files.slice(0, options.limit);

  const failures = [];
  const started = Date.now();
  let bytes = 0;
  for (const file of files) {
    const path = relative(corpusDir, file);
    const source = readFileSync(file, "utf8");
    bytes += source.length;
    const error = firstError(parser.parse(source), source);
    if (error) failures.push({ path, ...error, expected: NOT_VALID_FLIX.has(path) });
  }

  const elapsed = (Date.now() - started) / 1000;
  const unexpected = failures.filter((f) => !f.expected);
  const expected = failures.filter((f) => f.expected);

  console.log(
    `\n${files.length - failures.length}/${files.length} parsed with no error node ` +
      `(${(bytes / 1024 / 1024).toFixed(1)} MB in ${elapsed.toFixed(1)}s)`,
  );

  if (expected.length) {
    console.log(`\n${expected.length} expected — not valid Flix:`);
    for (const f of expected) console.log(`  ${f.path}\n      ${NOT_VALID_FLIX.get(f.path)}`);
  }

  if (unexpected.length) {
    console.log(`\n${unexpected.length} unexpected:`);
    for (const f of unexpected) console.log(`  ${f.path}:${f.line}\n      ${f.text}`);
  }

  const missing = [...NOT_VALID_FLIX.keys()].filter(
    (p) => !failures.some((f) => f.path === p) && files.some((f) => relative(corpusDir, f) === p),
  );
  if (missing.length) {
    console.log(
      `\n${missing.length} listed as not valid Flix but parsed — take them off the list:`,
    );
    for (const p of missing) console.log(`  ${p}`);
  }

  if (options.json) {
    writeFileSync(options.json, `${JSON.stringify({ total: files.length, failures }, null, 2)}\n`);
  }

  process.exit(unexpected.length || missing.length ? 1 : 0);
}

await main();
