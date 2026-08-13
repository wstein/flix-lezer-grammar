import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { ProjectedChild, ProjectedNode, ProjectedToken } from "../../src/projection.js";
import { specPath } from "./spec.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

export interface ProjectionMap {
  mappings: Record<string, string>;
  ignored?: string[];
  flatten?: string[];
  recoveryMarkers?: string[];
}

export const MAP = JSON.parse(
  readFileSync(join(root, "conformance", "projection-map.json"), "utf8"),
) as ProjectionMap;

const IGNORED = new Set(MAP.ignored ?? []);
const FLATTEN = new Set(MAP.flatten ?? []);
const RECOVERY = new Set(MAP.recoveryMarkers ?? []);

function isToken(node: ProjectedChild): node is ProjectedToken {
  return "token" in node;
}

/**
 * Applies this grammar's declared transparency and renames its nodes to canonical kinds — what
 * `flix-spec`'s comparison does with the projection map, done here so the same answer is available
 * without leaving the repository. Returns a list because splicing a node yields its children.
 *
 * The rules are flix-spec's: `flatten` and recovery markers splice at any arity, `ignored` nodes
 * are dropped when empty and replaced by their child when singular, and kept otherwise.
 */
export function normalize(node: ProjectedChild): ProjectedChild[] {
  if (isToken(node)) return [node];

  const children = node.children.flatMap(normalize);
  const { kind } = node;

  if (FLATTEN.has(kind) || RECOVERY.has(kind)) return children;
  if (IGNORED.has(kind) && children.length <= 1) return children;

  return [{ kind: MAP.mappings[kind] ?? kind, span: node.span, children }];
}

export interface Difference {
  path: string;
  expected: string;
  actual: string;
}

function describe(node: ProjectedChild | undefined): string {
  if (!node) return "nothing";
  return isToken(node) ? `${node.token} ${JSON.stringify(node.text)}` : node.kind;
}

/**
 * The first structural difference between the reference's normalized tree and ours, in document
 * order. Spans are advisory in the projection format and are not compared.
 */
export function firstDifference(
  expected: ProjectedChild,
  actual: ProjectedChild | undefined,
  path = "",
): Difference | null {
  if (!actual) return { path, expected: describe(expected), actual: "nothing" };

  if (isToken(expected) || isToken(actual)) {
    if (!isToken(expected) || !isToken(actual) || expected.token !== actual.token) {
      return { path, expected: describe(expected), actual: describe(actual) };
    }
    return expected.text === actual.text
      ? null
      : { path, expected: describe(expected), actual: describe(actual) };
  }

  if (expected.kind !== actual.kind) {
    return { path, expected: expected.kind, actual: actual.kind };
  }

  const count = Math.max(expected.children.length, actual.children.length);
  for (let i = 0; i < count; i++) {
    const here = `${path}/${expected.kind}[${i}]`;
    const e = expected.children[i];
    const a = actual.children[i];
    if (!e) return { path: here, expected: "nothing", actual: describe(a) };
    const diff = firstDifference(e, a, here);
    if (diff) return diff;
  }
  return null;
}

/** The reference's normalized tree for a fixture, as committed in flix-spec. */
export function expectedTree(fixture: string): ProjectedNode {
  const doc = JSON.parse(
    readFileSync(specPath("fixtures/expected", `${fixture.replace(/\.flix$/, "")}.json`), "utf8"),
  ) as { units: { tree: ProjectedNode }[] };
  const unit = doc.units[0];
  if (!unit) throw new Error(`no unit in expected tree for ${fixture}`);
  return unit.tree;
}
