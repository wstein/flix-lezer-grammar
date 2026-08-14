import { EditorState } from "@codemirror/state";
import { foldable, getIndentation, indentUnit } from "@codemirror/language";
import { highlightTree, tagHighlighter, tags as t } from "@lezer/highlight";
import { describe, expect, it } from "vitest";

import { flix, flixLanguage, parser } from "../src/index.js";

/**
 * Highlights against the exact tags this grammar assigns rather than `classHighlighter`, which
 * folds a modified tag into its base — `definitionKeyword` comes out of that one as plain
 * `tok-keyword`, which would make these assertions pass for the wrong reason.
 */
const HIGHLIGHTER = tagHighlighter([
  { tag: t.definitionKeyword, class: "definitionKeyword" },
  { tag: t.controlKeyword, class: "controlKeyword" },
  { tag: t.operatorKeyword, class: "operatorKeyword" },
  { tag: t.moduleKeyword, class: "moduleKeyword" },
  { tag: t.modifier, class: "modifier" },
  { tag: t.bool, class: "bool" },
  { tag: t.definition(t.function(t.variableName)), class: "definitionName" },
  { tag: t.variableName, class: "variableName" },
  { tag: t.typeName, class: "typeName" },
  { tag: t.docComment, class: "docComment" },
  { tag: t.lineComment, class: "lineComment" },
  { tag: t.blockComment, class: "blockComment" },
  { tag: t.integer, class: "integer" },
  { tag: t.annotation, class: "annotation" },
]);

function highlight(source: string): { text: string; classes: string }[] {
  const out: { text: string; classes: string }[] = [];
  highlightTree(parser.parse(source), HIGHLIGHTER, (from, to, classes) => {
    out.push({ text: source.slice(from, to), classes });
  });
  return out;
}

function stateFor(doc: string): EditorState {
  return EditorState.create({ doc, extensions: [flix(), indentUnit.of("    ")] });
}

describe("highlighting", () => {
  // styleTags throws on a node name the grammar cannot produce, so merely configuring the parser
  // is already a check that every selector in src/highlight.ts is real. These assert that the
  // tags come out where they should.
  it.each([
    ["def", "definitionKeyword"],
    ["if", "controlKeyword"],
    ["pub", "modifier"],
    ["and", "operatorKeyword"],
    ["true", "bool"],
  ])("gives %s the %s class", (word, expected) => {
    const source = `pub def f(): Bool = if (true and false) true else false`;
    const found = highlight(source).filter((h) => h.text === word);
    expect(found.length, `no ${word} in output`).toBeGreaterThan(0);
    expect(found[0]?.classes).toContain(expected);
  });

  it("marks a definition name apart from a reference to one", () => {
    const spans = highlight("def f(): Int32 = g");
    const def = spans.find((s) => s.text === "f");
    const use = spans.find((s) => s.text === "g");
    expect(def?.classes).toBe("definitionName");
    expect(use?.classes).toBe("variableName");
  });

  it("distinguishes the three comment forms", () => {
    const spans = highlight("/// doc\n// line\n/* block */\ndef f(): Int32 = 1");
    expect(spans.find((s) => s.text.startsWith("///"))?.classes).toBe("docComment");
    expect(spans.find((s) => s.text.startsWith("// l"))?.classes).toBe("lineComment");
    expect(spans.find((s) => s.text.startsWith("/*"))?.classes).toBe("blockComment");
  });
});

describe("editor integration", () => {
  it("defines a language CodeMirror can use", () => {
    expect(flixLanguage.name).toBe("flix");
    expect(flix().language).toBe(flixLanguage);
  });

  it("indents inside a block", () => {
    const doc = "def f(): Int32 = {\n\n}";
    expect(getIndentation(stateFor(doc), doc.indexOf("\n") + 1)).toBe(4);
  });

  it("closes the indent again on the closing brace", () => {
    const doc = "def f(): Int32 = {\n    1\n}";
    expect(getIndentation(stateFor(doc), doc.lastIndexOf("}"))).toBe(0);
  });

  it("folds a block and a block comment", () => {
    const doc = "def f(): Int32 = {\n    1\n}";
    expect(foldable(stateFor(doc), 0, doc.indexOf("\n"))).toBeTruthy();
    const commented = "/* one\n   two */\ndef f(): Int32 = 1";
    expect(foldable(stateFor(commented), 0, commented.indexOf("\n"))).toBeTruthy();
  });

  it("carries the comment tokens a toggle-comment command needs", () => {
    const state = stateFor("def f(): Int32 = 1");
    const [comments] = state.languageDataAt<{ line: string }>("commentTokens", 0);
    expect(comments?.line).toBe("//");
  });
});
