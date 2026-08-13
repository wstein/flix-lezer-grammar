import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

/**
 * The flix-spec cache, materialised by `npm run fetch-spec` at the commit in `spec.pin.json`.
 * Gitignored on purpose: flix-spec owns these files, so this repository reads them and never
 * keeps a copy that could go stale.
 */
export const SPEC_DIR = join(root, ".spec");

export interface SpecPin {
  schemaVersion: number;
  note: string;
  flixSpec: { repository: string; commit: string; paths: string[]; contentDigest: string };
  flix: { tag: string; commit: string; oracleSha256: string };
}

export const PIN = JSON.parse(readFileSync(join(root, "spec.pin.json"), "utf8")) as SpecPin;

if (!existsSync(SPEC_DIR)) {
  throw new Error(
    "The flix-spec cache is missing. Run `npm run fetch-spec` (npm test does this for you).",
  );
}

export function specPath(...parts: string[]): string {
  return join(SPEC_DIR, ...parts);
}

export function specFile(rel: string): string {
  return readFileSync(specPath(rel), "utf8");
}

export interface Fixture {
  name: string;
  source: string;
}

/** The Flix sources flix-spec expects the reference parser to accept. */
export function positiveFixtures(): Fixture[] {
  return fixturesIn("fixtures/positive");
}

/** The Flix sources flix-spec expects the reference parser to reject or recover from. */
export function negativeFixtures(): Fixture[] {
  return fixturesIn("fixtures/negative");
}

function fixturesIn(rel: string): Fixture[] {
  return readdirSync(specPath(rel))
    .filter((f) => f.endsWith(".flix"))
    .sort()
    .map((name) => ({ name, source: readFileSync(specPath(rel, name), "utf8") }));
}

/** The upstream token vocabulary at the pinned release. */
export function tokenKinds(): string[] {
  const doc = JSON.parse(specFile("ast/tokenkind.json")) as { kinds: { name: string }[] };
  return doc.kinds.map((k) => k.name);
}

/** The upstream syntax-tree vocabulary at the pinned release, sub-trait qualified. */
export function treeKinds(): string[] {
  const doc = JSON.parse(specFile("ast/treekind.json")) as { kinds: { name: string }[] };
  return doc.kinds.map((k) => k.name);
}
