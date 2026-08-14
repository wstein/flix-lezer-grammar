// The CodeMirror 6 language package: the generated parser, configured with highlighting, folding
// and indentation, and wrapped as a `LanguageSupport`.

import {
  LRLanguage,
  LanguageSupport,
  delimitedIndent,
  foldInside,
  foldNodeProp,
  indentNodeProp,
} from "@codemirror/language";

import { parser as baseParser } from "./flix.grammar";
import { flixHighlighting } from "./highlight.js";

/** Every node whose body is brace-delimited, and so folds and indents the same way. */
const BRACED = [
  "ExprBlock",
  "EnumBody",
  "TraitBody",
  "InstanceBody",
  "EffectBody",
  "MatchRuleList",
  "ExtMatchRuleList",
  "HandlerRuleList",
  "ExprRecordOperation",
  "ExprFixpointConstraintSet",
  "ExprSelect",
  "TypeRecord",
  "TypeEffectSet",
  "TypeSchema",
  "PatternRecord",
  "UseOrImportMany",
  "ImportMany",
].join(" ");

/**
 * The Flix parser with CodeMirror's props attached. Exported configured rather than raw so that a
 * consumer wanting only the tree still gets the highlighting metadata; `@lezer/highlight` reads it
 * from the node types.
 */
export const parser = baseParser.configure({
  props: [
    flixHighlighting,
    indentNodeProp.add({
      [BRACED]: delimitedIndent({ closing: "}" }),
      "ParameterList ArgumentList TypeParameterList TypeArgumentList": delimitedIndent({
        closing: ")",
      }),
      DeclModule: delimitedIndent({ closing: "}" }),
    }),
    foldNodeProp.add({
      [BRACED]: foldInside,
      DeclModule: foldInside,
      CommentBlock: (node) => ({ from: node.from + 2, to: node.to - 2 }),
    }),
  ],
});

export const flixLanguage = LRLanguage.define({
  name: "flix",
  parser,
  languageData: {
    // `///` is a doc comment and `////` a line comment again (docs/LEXER.md §3); both start `//`,
    // so toggling a line comment with `//` is correct for either.
    commentTokens: { line: "//", block: { open: "/*", close: "*/" } },
    closeBrackets: { brackets: ["(", "[", "{", "'", '"'] },
    indentOnInput: /^\s*[}\])]$/,
    wordChars: "_!$",
  },
});

/** Drop-in language support for a CodeMirror 6 editor. */
export function flix(): LanguageSupport {
  return new LanguageSupport(flixLanguage);
}

export { flixHighlighting } from "./highlight.js";
export * from "./projection.js";
