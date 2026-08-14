import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { positiveFixtures } from "./helpers/spec.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const conformance = readFileSync(resolve(root, "docs", "CONFORMANCE.md"), "utf8");

/**
 * `docs/CONFORMANCE.md` quotes counts that move whenever the grammar does, and three of them had
 * already drifted apart before anyone noticed — the section claimed 112 of 116 fixtures parsed and
 * then, four lines later, that all of them did. Prose cannot be trusted to keep a number; this
 * reads the numbers back out of the document and checks them, so the failure arrives with the
 * right value in the message instead of surviving a review.
 */
function stated(pattern: RegExp): { count: number; total: number } {
  const match = conformance.match(pattern);
  if (!match?.[1] || !match[2]) throw new Error(`docs/CONFORMANCE.md no longer states ${pattern}`);
  return { count: Number(match[1]), total: Number(match[2]) };
}

describe("the counts docs/CONFORMANCE.md states", () => {
  it("agrees with the fixture suite about how many fixtures there are", () => {
    const oracle = stated(/Oracle lane: (\d+) of (\d+) fixtures/);
    expect(oracle.total).toBe(positiveFixtures().length);
  });

  it("agrees with test/conformance.test.ts about how many of them match", async () => {
    const oracle = stated(/Oracle lane: (\d+) of (\d+) fixtures/);
    const source = readFileSync(resolve(root, "test", "conformance.test.ts"), "utf8");
    const listed = source.slice(source.indexOf("ACCEPTED_DIVERGENCES")).match(/\.flix"/g) ?? [];
    expect(oracle.total - oracle.count).toBe(listed.length);
  });

  it("agrees with scripts/parse-corpus.mjs about the corpus", () => {
    const corpus = stated(/Corpus: (\d+) of (\d+) upstream/);
    const inventory = JSON.parse(
      readFileSync(resolve(root, ".spec", "corpus", "corpus.json"), "utf8"),
    ) as { counts: { totalFlixFiles: number } };
    expect(corpus.total).toBe(inventory.counts.totalFlixFiles);
    // The corpus is not parsed here — it needs a checkout `npm run corpus` fetches — so this only
    // pins the denominator and that the numerator is a plausible fraction of it.
    expect(corpus.count).toBeGreaterThan(0);
    expect(corpus.count).toBeLessThanOrEqual(corpus.total);
  });
});
