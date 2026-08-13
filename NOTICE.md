# Notice & Third-Party Provenance

This product includes software and artifacts derived from the Flix compiler project
(`github.com/flix/flix`), licensed under the Apache License 2.0.

## 1. Flix Reference Compiler

- **Upstream repository**: https://github.com/flix/flix
- **Pinned tag / release**: `v0.75.2`
- **Pinned commit SHA**: `40949531b4d42e5eaf2e4b9997537eaf793c24e7`
- **License**: Apache License 2.0 (http://www.apache.org/licenses/LICENSE-2.0)
- **Copyright**: Copyright (c) 2015-2026 Flix authors & University of Waterloo

The token vocabulary, the operator precedence table and the whitespace-sensitive lexical rules
implemented here are transliterated from that release's
`main/src/ca/uwaterloo/flix/language/phase/Lexer.scala`,
`main/src/ca/uwaterloo/flix/language/phase/Parser2.scala` and
`main/src/ca/uwaterloo/flix/language/ast/TokenKind.scala`. Every non-obvious rule in `src/` cites
the upstream line it was read from, so a pin bump has somewhere concrete to start.

No upstream source is vendored into this repository.

## 2. Test Fixtures from flix-spec

The fixtures, vocabulary inventories and schemas this repository is tested against come from
[`wstein/flix-spec`](https://github.com/wstein/flix-spec) (Apache License 2.0), fetched at the
commit recorded in `spec.pin.json` into the gitignored `.spec/` cache by `scripts/fetch-spec.mjs`.

None of it is redistributed here. `flix-spec` owns those files; a copy in this repository could
only ever be a stale one, and a stale fixture silently changes what conformance means.

The Flix sources under `fixtures/` were in turn adapted by `flix-spec` from the corpus of
[`wstein/tree-sitter-flix`](https://github.com/wstein/tree-sitter-flix) (MIT, Copyright (c) 2026
Werner Stein); only the Flix source of each entry was taken.

## 3. Runtime and Build Dependencies

The published package depends at runtime only on `@lezer/lr`, `@lezer/common` and
`@lezer/highlight` (MIT, Copyright (c) 2018 by Marijn Haverbeke and others), declared as peer
dependencies. The CodeMirror integration additionally expects `@codemirror/language` (MIT) in the
host application. Build and test tooling — `@lezer/generator`, Rollup, TypeScript, ESLint,
Prettier, Vitest, Ajv — is development-scoped and not redistributed.
