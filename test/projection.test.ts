import Ajv from "ajv";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { parser } from "../src/flix.grammar";
import {
  ERROR_NODE,
  project,
  projectionDocument,
  tokensOf,
  type ProjectedNode,
} from "../src/projection.js";
import { PIN, positiveFixtures, specFile, tokenKinds, treeKinds } from "./helpers/spec.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

interface ProjectionMap {
  schemaVersion: number;
  consumer: string;
  mappings: Record<string, string>;
  ignored?: string[];
  flatten?: string[];
  recoveryMarkers?: string[];
}

const MAP = JSON.parse(
  readFileSync(join(root, "conformance", "projection-map.json"), "utf8"),
) as ProjectionMap;

const TOKENS = new Set(tokenKinds());

/** Every node name this grammar can produce, tokens excluded. */
function grammarNodeNames(): string[] {
  const names = new Set<string>();
  for (const type of parser.nodeSet.types) {
    if (!type.name || type.isAnonymous || TOKENS.has(type.name)) continue;
    names.add(type.isError ? ERROR_NODE : type.name);
  }
  return [...names].sort();
}

function projectFixture(name: string, source: string): ProjectedNode {
  return project(source, { tokenKinds: TOKENS, path: `fixtures/positive/${name}` }).tree;
}

describe("projection map", () => {
  it("satisfies flix-spec's projection-map schema", () => {
    const validate = new Ajv({ strict: false }).compile(
      JSON.parse(specFile("schemas/projection-map.schema.json")) as object,
    );
    expect(validate(MAP), JSON.stringify(validate.errors)).toBe(true);
  });

  it("maps only onto kinds the reference actually has", () => {
    const canonical = new Set(treeKinds());
    const invented = [...new Set(Object.values(MAP.mappings))].filter((k) => !canonical.has(k));
    expect(invented).toEqual([]);
  });

  // Mapping onto a kind that can appear in no tree from any input is always wrong, and is not
  // caught by checking the kind exists: `TypeParameter` is in ast/treekind.json and is never
  // constructed. This is the guard for that whole class.
  it("maps onto no structurally unattachable kind", () => {
    const unattachable = new Set(
      (
        JSON.parse(specFile("ast/unattachable.json")) as { treeKinds: { name: string }[] }
      ).treeKinds.map((k) => k.name),
    );
    const unreachable = [...new Set(Object.values(MAP.mappings))].filter((k) =>
      unattachable.has(k),
    );
    expect(unreachable).toEqual([]);
  });

  it("accounts for every node this grammar can produce", () => {
    const known = new Set([
      ...Object.keys(MAP.mappings),
      ...(MAP.ignored ?? []),
      ...(MAP.flatten ?? []),
      ...(MAP.recoveryMarkers ?? []),
    ]);
    expect(grammarNodeNames().filter((name) => !known.has(name))).toEqual([]);
  });
});

describe("projected documents", () => {
  const fixtures = positiveFixtures();

  it("satisfies flix-spec's projection schema", () => {
    const validate = new Ajv({ strict: false }).compile(
      JSON.parse(specFile("schemas/projection.schema.json")) as object,
    );
    const units = fixtures.map(({ name, source }) =>
      project(source, { tokenKinds: TOKENS, path: `fixtures/positive/${name}` }),
    );
    const document = projectionDocument(units, {
      upstreamCommit: PIN.flix.commit,
      oracleSha256: PIN.flix.oracleSha256,
    });
    expect(validate(document), JSON.stringify(validate.errors?.slice(0, 3))).toBe(true);
  });

  // flix-spec's own rule for its oracle-free lane: a tree must account for its source. Anything a
  // token does not cover has to be whitespace, or the grammar dropped input on the floor.
  it.each(fixtures.map((f) => [f.name, f.source] as const))(
    "accounts for every character of %s",
    (name, source) => {
      let offset = 0;
      for (const token of tokensOf(projectFixture(name, source))) {
        const from = source.indexOf(token.text, offset);
        expect(
          from,
          `${name}: ${token.token} ${JSON.stringify(token.text)}`,
        ).toBeGreaterThanOrEqual(offset);
        expect(source.slice(offset, from).trim(), `gap before ${token.token} in ${name}`).toBe("");
        offset = from + token.text.length;
      }
      expect(source.slice(offset).trim(), `trailing text in ${name}`).toBe("");
    },
  );
});
