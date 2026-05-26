#!/usr/bin/env node
/**
 * Bump Taoscope's version in lock-step across the three places it lives:
 *   - package.json
 *   - src-tauri/Cargo.toml
 *   - src-tauri/tauri.conf.json
 *
 * Then refresh Cargo.lock, commit the change, and create a git tag named
 * `v<new>`. Used as `pnpm bump patch | minor | major | <x.y.z>`.
 *
 * Why this isn't just `pnpm version`: `pnpm version` only touches
 * package.json; the Rust side ships a separate `Cargo.toml` and the bundler
 * reads `tauri.conf.json` — a drift between any two of them confuses the
 * updater (the installed app's version won't match what `latest.json`
 * advertises) and surfaces as "update available" loops or silent skips.
 *
 * Safe-guards:
 *   - Refuses to run with a dirty working tree (mirrors `pnpm version`).
 *   - Refuses if all three files don't already agree on the current version.
 *   - Performs every file edit before commit-staging so a parse failure
 *     half-way leaves the repo unchanged.
 */

import { execSync } from "node:child_process";
import * as fs from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, "..");

const PKG = resolve(repoRoot, "package.json");
const CARGO = resolve(repoRoot, "src-tauri/Cargo.toml");
const TCONF = resolve(repoRoot, "src-tauri/tauri.conf.json");

function die(msg) {
  console.error(`✕ ${msg}`);
  process.exit(1);
}

function sh(cmd, opts = {}) {
  const out = execSync(cmd, { stdio: "pipe", cwd: repoRoot, ...opts });
  // With `stdio: "inherit"` execSync returns null (output went to the
  // terminal directly). Callers that don't need the captured stdout pass
  // inherit so the user can see long-running commands like cargo check.
  return out == null ? "" : out.toString().trim();
}

function isCleanWorktree() {
  return sh("git status --porcelain").length === 0;
}

function readFile(path) {
  return fs.readFileSync(path, "utf8");
}

function writeFile(path, content) {
  fs.writeFileSync(path, content, "utf8");
}

function parseSemver(v) {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(v);
  if (!m) return null;
  return { major: +m[1], minor: +m[2], patch: +m[3] };
}

function bump(current, kind) {
  if (parseSemver(kind)) return kind; // explicit x.y.z
  const v = parseSemver(current);
  if (!v) die(`current version "${current}" is not x.y.z`);
  switch (kind) {
    case "patch":
      return `${v.major}.${v.minor}.${v.patch + 1}`;
    case "minor":
      return `${v.major}.${v.minor + 1}.0`;
    case "major":
      return `${v.major + 1}.0.0`;
    default:
      die(`unknown bump kind "${kind}" — use patch | minor | major | x.y.z`);
  }
}

// ── extract / patch each file ─────────────────────────────────────────────

function currentPackageJsonVersion() {
  const json = JSON.parse(readFile(PKG));
  return json.version;
}

function writePackageJsonVersion(next) {
  // Preserve the file's trailing newline and key order by patching the
  // matching line rather than re-serialising the whole JSON (which would
  // also collapse 2-space indentation if the file uses tabs in the future).
  const src = readFile(PKG);
  const re = /("version"\s*:\s*")[^"]+(")/;
  if (!re.test(src)) die(`couldn't find "version" key in package.json`);
  writeFile(PKG, src.replace(re, `$1${next}$2`));
}

function currentCargoVersion() {
  const src = readFile(CARGO);
  const m = /^version\s*=\s*"([^"]+)"/m.exec(src);
  if (!m) die(`couldn't find version in src-tauri/Cargo.toml`);
  return m[1];
}

function writeCargoVersion(next) {
  const src = readFile(CARGO);
  // Only touch the FIRST `version = "..."` line (the [package] one). Cargo
  // dependency entries that pin versions would also match if we used /g.
  writeFile(
    CARGO,
    src.replace(/^version\s*=\s*"[^"]+"/m, `version = "${next}"`),
  );
}

function currentTauriConfVersion() {
  const json = JSON.parse(readFile(TCONF));
  return json.version;
}

function writeTauriConfVersion(next) {
  const src = readFile(TCONF);
  const re = /("version"\s*:\s*")[^"]+(")/;
  if (!re.test(src))
    die(`couldn't find "version" key in src-tauri/tauri.conf.json`);
  writeFile(TCONF, src.replace(re, `$1${next}$2`));
}

// ── main ──────────────────────────────────────────────────────────────────

const kind = process.argv[2];
if (!kind) {
  die("usage: pnpm bump <patch|minor|major|x.y.z>");
}

if (!isCleanWorktree()) {
  die("working tree is not clean — commit or stash first.");
}

const vPkg = currentPackageJsonVersion();
const vCargo = currentCargoVersion();
const vTConf = currentTauriConfVersion();
if (vPkg !== vCargo || vPkg !== vTConf) {
  die(
    `version drift across files: package.json=${vPkg}, Cargo.toml=${vCargo}, tauri.conf.json=${vTConf}. Fix manually before bumping.`,
  );
}

const next = bump(vPkg, kind);
if (next === vPkg) die(`computed next version equals current (${vPkg}).`);

console.log(`→ ${vPkg}  ⇒  ${next}`);

writePackageJsonVersion(next);
writeCargoVersion(next);
writeTauriConfVersion(next);

// Refresh Cargo.lock so the bumped Cargo.toml doesn't desync. `cargo check`
// is the cheapest way to make Cargo notice and rewrite the lockfile; we
// don't actually need a full build here.
console.log("→ refreshing Cargo.lock…");
try {
  sh("cargo check --manifest-path src-tauri/Cargo.toml --quiet", {
    stdio: "inherit",
  });
} catch {
  die("cargo check failed — Cargo.lock not refreshed. Aborting before commit.");
}

const filesToStage = [
  "package.json",
  "src-tauri/Cargo.toml",
  "src-tauri/Cargo.lock",
  "src-tauri/tauri.conf.json",
];
sh(`git add ${filesToStage.join(" ")}`);

const tag = `v${next}`;
const msg = `chore(release): ${next}`;
sh(`git commit -m ${JSON.stringify(msg)}`);
sh(`git tag ${tag}`);

console.log(`✓ committed and tagged ${tag}`);
console.log("→ push with:  git push --follow-tags origin main");
