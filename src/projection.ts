// Projects a Lezer parse tree into flix-spec's canonical projected-tree format.
//
// This emits `form: "raw"`: this grammar's own node names, its own error nodes, nothing
// normalised away. That is what a consumer is asked for — flix-spec applies the transparency
// rules declared in `conformance/projection-map.json` itself, because two of its three
// conformance lanes reduce the tree differently. See docs/CONFORMANCE.md.

import type { SyntaxNode, Tree } from "@lezer/common";

import { parser } from "./flix.grammar";

export interface Position {
  line: number;
  col: number;
}

export interface Span {
  start: Position;
  end: Position;
}

/** A leaf. `token` is the upstream `TokenKind` name, which is also this grammar's node name. */
export interface ProjectedToken {
  token: string;
  text: string;
  start: Position;
  end: Position;
}

export interface ProjectedNode {
  kind: string;
  span: Span;
  children: ProjectedChild[];
}

export type ProjectedChild = ProjectedNode | ProjectedToken;

export interface Diagnostic {
  kind: string;
  line: number;
}

export interface CompilationUnit {
  source: string;
  diagnostics: Diagnostic[];
  tree: ProjectedNode;
}

export interface Provenance {
  upstreamCommit: string;
  oracleSha256: string;
}

export interface ProjectionDocument {
  schemaVersion: 2;
  generatedBy: string;
  toolVersion: string;
  form: "raw";
  upstreamCommit: string;
  oracleSha256: string;
  units: CompilationUnit[];
}

export const GENERATED_BY = "flix-lezer-grammar/src/projection.ts";
export const TOOL_VERSION = "1.0.0";

/** Lezer names its error node `⚠`; `conformance/projection-map.json` declares it as such. */
export const ERROR_NODE = "⚠";

/**
 * `Parser2.open()` consumes any run of comments at a node's start into a `CommentList`. Comments
 * are `@skip` tokens here, and Lezer cannot group skipped tokens under a node, so the grouping is
 * reconstructed at projection time instead: a maximal run of adjacent comment children becomes one
 * `CommentList`. This regroups tokens the parse already produced, in the order it produced them —
 * it invents nothing and can lose nothing.
 */
const COMMENT_TOKENS = new Set(["CommentLine", "CommentDoc", "CommentBlock"]);
export const COMMENT_LIST = "CommentList";

function groupComments(children: ProjectedChild[]): ProjectedChild[] {
  if (!children.some((c) => "token" in c && COMMENT_TOKENS.has(c.token))) return children;

  const grouped: ProjectedChild[] = [];
  let run: ProjectedToken[] = [];
  const flush = (): void => {
    const first = run[0];
    const last = run[run.length - 1];
    if (first && last) {
      grouped.push({
        kind: COMMENT_LIST,
        span: { start: first.start, end: last.end },
        children: [...run],
      });
    }
    run = [];
  };

  for (const child of children) {
    if ("token" in child && COMMENT_TOKENS.has(child.token)) run.push(child);
    else {
      flush();
      grouped.push(child);
    }
  }
  flush();
  return grouped;
}

/**
 * Maps offsets to 1-indexed line/column. Built once per source rather than per node, since a tree
 * has a node per token and rescanning for each would be quadratic.
 */
class LineIndex {
  private readonly lineStarts: number[] = [0];

  constructor(private readonly source: string) {
    for (let i = 0; i < source.length; i++) {
      if (source.charCodeAt(i) === 10) this.lineStarts.push(i + 1);
    }
  }

  positionAt(offset: number): Position {
    let low = 0;
    let high = this.lineStarts.length - 1;
    while (low < high) {
      const mid = (low + high + 1) >> 1;
      if ((this.lineStarts[mid] ?? 0) <= offset) low = mid;
      else high = mid - 1;
    }
    return { line: low + 1, col: offset - (this.lineStarts[low] ?? 0) + 1 };
  }

  /** The source text is needed for token text, and carrying it here keeps the walk to one object. */
  slice(from: number, to: number): string {
    return this.source.slice(from, to);
  }
}

export interface ProjectOptions {
  /**
   * The upstream token vocabulary — `ast/tokenkind.json` from flix-spec. It is what decides
   * whether a tree node is a leaf token or a syntax node, and taking that from the digest-pinned
   * inventory rather than from a list maintained here means the two cannot drift apart.
   */
  tokenKinds: ReadonlySet<string>;
  /** Repository-relative path recorded as the unit's `source`. */
  path: string;
}

function projectNode(
  node: SyntaxNode,
  index: LineIndex,
  tokens: ReadonlySet<string>,
): ProjectedChild {
  const name = node.type.isError ? ERROR_NODE : node.name;

  if (tokens.has(name)) {
    return {
      token: name,
      text: index.slice(node.from, node.to),
      start: index.positionAt(node.from),
      end: index.positionAt(node.to),
    };
  }

  const children: ProjectedChild[] = [];
  for (let child = node.firstChild; child; child = child.nextSibling) {
    children.push(projectNode(child, index, tokens));
  }

  return {
    kind: name,
    span: { start: index.positionAt(node.from), end: index.positionAt(node.to) },
    children: groupComments(children),
  };
}

/** Projects one already-parsed tree. */
export function projectTree(tree: Tree, source: string, options: ProjectOptions): CompilationUnit {
  const index = new LineIndex(source);
  const root = projectNode(tree.topNode, index, options.tokenKinds);

  // A top node is never a token, so this cast holds by construction of `projectNode`.
  const projected = root as ProjectedNode;

  // Lezer reports errors as nodes rather than as a diagnostic list; the recovery lane reads them
  // from the tree, so `diagnostics` stays empty rather than being invented here.
  return { source: options.path, diagnostics: [], tree: projected };
}

/** Parses and projects a single source. */
export function project(source: string, options: ProjectOptions): CompilationUnit {
  return projectTree(parser.parse(source), source, options);
}

/** Wraps units in the document envelope the projection schema requires. */
export function projectionDocument(
  units: CompilationUnit[],
  provenance: Provenance,
): ProjectionDocument {
  return {
    schemaVersion: 2,
    generatedBy: GENERATED_BY,
    toolVersion: TOOL_VERSION,
    form: "raw",
    upstreamCommit: provenance.upstreamCommit,
    oracleSha256: provenance.oracleSha256,
    units,
  };
}

/**
 * Every token in order. `flix-spec`'s token-accounting rule is that a tree must account for its
 * source; this is what makes that checkable from the outside.
 */
export function tokensOf(node: ProjectedChild, into: ProjectedToken[] = []): ProjectedToken[] {
  if ("token" in node) into.push(node);
  else for (const child of node.children) tokensOf(child, into);
  return into;
}
