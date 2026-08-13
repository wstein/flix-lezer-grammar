import { describe, expect, it } from "vitest";

import { contentDigest } from "../scripts/fetch-spec.mjs";
import { PIN, SPEC_DIR, specFile, tokenKinds, treeKinds } from "./helpers/spec.js";

/**
 * The `.spec/` cache is the only thing in this repository that decides what conformance means, and
 * it is fetched rather than committed. These tests exist so that a locally edited fixture, a
 * half-finished fetch, or a pin moved in one field but not another fails loudly instead of quietly
 * redefining the target.
 */
describe("flix-spec cache", () => {
  it("matches the content digest recorded in spec.pin.json", () => {
    expect(contentDigest(SPEC_DIR)).toBe(PIN.flixSpec.contentDigest);
  });

  it("agrees with the Flix release that flix-spec itself pins", () => {
    const upstream = JSON.parse(specFile("pin.json")) as {
      upstream: { tag: string; commit: string };
      oracleArtifact: { sha256: string };
    };
    expect(PIN.flix.tag).toBe(upstream.upstream.tag);
    expect(PIN.flix.commit).toBe(upstream.upstream.commit);
    expect(PIN.flix.oracleSha256).toBe(upstream.oracleArtifact.sha256);
  });
});

describe("upstream vocabulary", () => {
  it("carries the token inventory the grammar is measured against", () => {
    const doc = JSON.parse(specFile("ast/tokenkind.json")) as { tokenKindCount: number };
    expect(tokenKinds()).toHaveLength(doc.tokenKindCount);
    expect(tokenKinds()).toContain("KeywordDef");
  });

  it("carries the tree-kind inventory the projection map is measured against", () => {
    const doc = JSON.parse(specFile("ast/treekind.json")) as { treeKindCount: number };
    expect(treeKinds()).toHaveLength(doc.treeKindCount);
    expect(treeKinds()).toContain("Expr.Apply");
  });

  it("no longer carries the trait syntax retired in the pinned release", () => {
    // Flix v0.75.2 removed Decl.Law, KeywordLaw and KeywordLawful. This grammar supports the
    // current language only, so their absence upstream is a precondition rather than trivia.
    expect(tokenKinds()).not.toContain("KeywordLaw");
    expect(tokenKinds()).not.toContain("KeywordLawful");
    expect(treeKinds()).not.toContain("Decl.Law");
  });
});

describe("fixture corpus", () => {
  it("provides the positive and negative fixture sets the grammar is checked against", async () => {
    const { positiveFixtures, negativeFixtures } = await import("./helpers/spec.js");
    expect(positiveFixtures().length).toBeGreaterThan(100);
    expect(negativeFixtures().length).toBeGreaterThan(10);
    for (const { name, source } of [...positiveFixtures(), ...negativeFixtures()]) {
      expect(source, name).not.toBe("");
    }
  });
});
