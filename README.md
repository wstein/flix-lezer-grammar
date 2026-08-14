# flix-lezer-grammar

A [Lezer][lezer] grammar for the [Flix][flix] programming language, plus the
[CodeMirror 6][codemirror] language package built on it — syntax highlighting, folding and
indentation for the current Flix release, in the browser.

Flix is a functional, imperative and logic language with a Hindley–Milner type system, a
polymorphic effect system, and first-class Datalog constraints. All of that is surface syntax, and
all of it is in scope here.

The grammar is transliterated from the reference compiler's `Lexer.scala` and `Parser2.scala`
rather than from documentation, and checked against [`wstein/flix-spec`][flix-spec] — the shared
oracle that `tree-sitter-flix`, `flix-antlr-grammar` and `flix-textmate` are also checked against.

## Scope: one language version, no dialects

This grammar targets **the current Flix release only** — `v0.75.2`, as pinned in
[`spec.pin.json`](spec.pin.json). There is no `@dialects` block and no compatibility
path for retired syntax: `law` and `lawful` are ordinary lowercase names here, because that is what
they are in the language today.

A dialect switch would have to be maintained against versions no one can test against, and Lezer
compiles every dialect into the same tables whether or not anyone enables them. Following the
current release is the cheaper and more honest contract.

## Status

| Phase | Delivers                                             | State |
| ----- | ---------------------------------------------------- | ----- |
| 1     | Toolchain, docs, digest-pinned `flix-spec` cache     | ✅    |
| 2     | Lexical layer: `@tokens` and six external tokenizers | ✅    |
| 3     | Declarations, types, patterns, expressions, Datalog  | ✅    |
| 4     | Projected trees and the `flix-spec` projection map   | ✅    |
| 5     | CodeMirror language package                          | ✅    |
| 6     | Whole-corpus parse                                   | ⏳    |

All 116 positive `flix-spec` fixtures parse with no error node, and 115 of them match the
reference's own tree node for node. The one that does not is an accepted divergence with a stated
reason, not a gap — see [`docs/CONFORMANCE.md`](docs/CONFORMANCE.md).

## Install

```sh
npm install @wstein/lezer-flix
```

`@lezer/lr`, `@lezer/common`, `@lezer/highlight` and `@codemirror/language` are peer dependencies.

```js
import { EditorView, basicSetup } from "codemirror";
import { flix } from "@wstein/lezer-flix";

new EditorView({
  doc: 'def main(): Unit \\ IO = println("hello")',
  extensions: [basicSetup, flix()],
  parent: document.body,
});
```

`flix()` is a `LanguageSupport` with highlighting, folding, indentation and bracket matching. The
raw `parser` is exported too, for tooling that wants the tree without an editor.

## Layout

```text
spec.pin.json         # The flix-spec commit and Flix release this repository is measured against
src/
  flix.grammar        # The Lezer grammar
  tokens.ts           # External tokenizers: three lexical, three zero-width lookahead
  highlight.ts        # styleTags — grammar nodes to @lezer/highlight tags
  index.ts            # LRLanguage + CodeMirror extension entry point
  projection.ts       # Lezer tree -> flix-spec canonical projected tree (form: raw)
conformance/
  projection-map.json # This grammar's vocabulary, mapped onto canonical TreeKinds
docs/
  ARCHITECTURE.md     # Why the grammar is shaped the way it is
  LEXER.md            # The external tokenizer contract, cited to Lexer.scala
  CONFORMANCE.md      # What this repository claims against flix-spec, and what it does not
scripts/
  fetch-spec.mjs      # Materialise .spec/ at the pinned flix-spec commit, digest-verified
  parse-corpus.mjs    # Parse every .flix file in an upstream checkout
```

`.spec/` and `.corpus/` are fetched, digest-verified caches. Neither is committed — `flix-spec` and
`flix/flix` own those files, and a copy here could only ever be a stale one.

## Development

```sh
npm run check       # format:check + lint + typecheck + test — what CI runs
npm run build       # lezer-generator + Rollup -> dist/
npm test            # Vitest (fetches .spec/ first if absent)
npm run format      # Prettier, in place
npm run lint:fix    # ESLint, in place
npm run fetch-spec  # Materialise .spec/ at the commit in spec.pin.json and verify its digest
npm run corpus      # Parse an upstream Flix checkout; reports files that fail
```

Moving to a newer Flix release means moving the `flix-spec` pin:

```sh
node scripts/fetch-spec.mjs --commit <flix-spec-sha>   # rewrites spec.pin.json
```

## Relationship to flix-spec

`flix-spec` owns the comparison; this repository owns its own vocabulary. Concretely:

- It emits **`form: raw`** projected trees — its own node names, its own error-recovery nodes,
  nothing normalised away — and a `projection-map.json` mapping those names onto canonical
  `TreeKind`s. `flix-spec` applies the normalisation itself, because two of its three conformance
  lanes reduce the tree differently.
- The **oracle lane** is the target: agreement about the structure of valid programs.
- The **recovery lane** will not match, and that is structural rather than a gap. Flix has three
  recovery kinds (`ErrorTree`, `OperatorError`, `TrailingDot`); Lezer has exactly one error node.
  [`docs/CONFORMANCE.md`](docs/CONFORMANCE.md) states what is claimed and what is not.

## License

Apache-2.0, matching `flix/flix`. See [`LICENSE.md`](LICENSE.md) and [`NOTICE.md`](NOTICE.md).

[lezer]: https://lezer.codemirror.net/
[flix]: https://flix.dev/
[codemirror]: https://codemirror.net/
[flix-spec]: https://github.com/wstein/flix-spec
