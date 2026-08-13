#!/usr/bin/env node
// Materialises the parts of wstein/flix-spec this repository is measured against into the
// gitignored .spec/ cache, at the commit named in spec.pin.json, and verifies the result against
// the recorded content digest.
//
// Nothing fetched here is committed. flix-spec owns those files; a copy in this repository could
// only ever be a stale one, and a stale fixture silently changes what conformance means.
//
// Usage:
//   node scripts/fetch-spec.mjs            # ensure the cache exists and matches the pin
//   node scripts/fetch-spec.mjs --force    # re-fetch even if the cache is already valid
//   node scripts/fetch-spec.mjs --commit <sha>
//                                          # move the pin: fetch, re-derive the digest, rewrite
//                                          # spec.pin.json from flix-spec's own pin.json

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pinPath = join(root, "spec.pin.json");
const cacheDir = join(root, ".spec");

const ZERO_DIGEST = "0".repeat(64);

function sha256(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

function walk(dir, base = dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full, base));
    else out.push(relative(base, full));
  }
  return out;
}

/**
 * A digest over the fetched subset: sorted `path\0sha256(content)\n` lines. Stable across
 * re-archiving, unlike a tarball byte-image, and sensitive to any content or inventory change.
 */
export function contentDigest(dir) {
  const lines = walk(dir)
    .sort()
    .map((rel) => `${rel}\0${sha256(readFileSync(join(dir, rel)))}\n`);
  return sha256(Buffer.from(lines.join(""), "utf8"));
}

function fetchInto(commit, paths, dest) {
  const tmp = mkdtempSync(join(tmpdir(), "flix-spec-"));
  try {
    const tarball = join(tmp, "spec.tar.gz");
    execFileSync(
      "curl",
      ["-fsSL", "-o", tarball, `https://codeload.github.com/wstein/flix-spec/tar.gz/${commit}`],
      { stdio: ["ignore", "inherit", "inherit"] },
    );
    execFileSync("tar", ["-xzf", tarball, "-C", tmp], { stdio: "inherit" });
    const extracted = join(tmp, `flix-spec-${commit}`);

    rmSync(dest, { recursive: true, force: true });
    for (const rel of paths) {
      const target = join(dest, rel);
      mkdirSync(dirname(target), { recursive: true });
      cpSync(join(extracted, rel), target, { recursive: true });
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

function main() {
  const pin = JSON.parse(readFileSync(pinPath, "utf8"));
  const argv = process.argv.slice(2);
  const commitIdx = argv.indexOf("--commit");
  const moving = commitIdx !== -1;
  const commit = moving ? argv[commitIdx + 1] : pin.flixSpec.commit;
  const force = argv.includes("--force") || moving;

  if (!/^[0-9a-f]{40}$/.test(commit ?? "")) {
    console.error(`Not a full commit SHA: ${commit}`);
    process.exit(1);
  }

  const stampPath = join(cacheDir, ".commit");
  const cached =
    existsSync(cacheDir) && existsSync(stampPath) && readFileSync(stampPath, "utf8") === commit;

  if (!cached || force) {
    console.log(`Fetching flix-spec ${commit.slice(0, 8)}`);
    fetchInto(commit, pin.flixSpec.paths, cacheDir);
    writeFileSync(stampPath, commit);
  }

  const digest = contentDigest(cacheDir);

  if (moving || pin.flixSpec.contentDigest === ZERO_DIGEST) {
    const upstream = JSON.parse(readFileSync(join(cacheDir, "pin.json"), "utf8"));
    pin.flixSpec.commit = commit;
    pin.flixSpec.contentDigest = digest;
    pin.flix = {
      tag: upstream.upstream.tag,
      commit: upstream.upstream.commit,
      oracleSha256: upstream.oracleArtifact.sha256,
    };
    writeFileSync(pinPath, `${JSON.stringify(pin, null, 2)}\n`);
    console.log(`Pinned flix-spec ${commit.slice(0, 8)} for Flix ${pin.flix.tag}`);
    console.log(`Content digest ${digest}`);
    return;
  }

  if (digest !== pin.flixSpec.contentDigest) {
    console.error(
      `.spec/ does not match spec.pin.json\n` +
        `  expected ${pin.flixSpec.contentDigest}\n` +
        `  actual   ${digest}\n` +
        `Re-run with --force, or with --commit <sha> to move the pin deliberately.`,
    );
    process.exit(1);
  }

  console.log(`.spec/ matches flix-spec ${commit.slice(0, 8)} (Flix ${pin.flix.tag})`);
}

// The digest helper is imported by the test suite; only run the CLI when invoked directly.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
