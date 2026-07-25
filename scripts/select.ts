import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Shared, tolerant CLI selector used by every quality script, so filtering behaves identically everywhere
// with no per-script documentation — mirroring the external tools by the operation's nature:
//   • FILE operations (order/format/lint/completeness/type-home, and check/fix over them) filter by PATH,
//     using filterPaths() — the same substring-on-normalized-path match order.ts already used.
//   • NAME / package-iterating operations (api, and vitest natively) filter by package NAME, using
//     selectPackages() — a substring that fans out over the matching packages.
//
// A "selector" is any positional CLI argument that is not a flag. It is resolved tolerantly: a bare name
// (`scene-formats`), a scoped name (`@flighthq/scene-formats`), a package dir or file path
// (`packages/scene-formats/src/gltfParse.ts`), or a substring — all resolve without the caller needing to
// know which form was passed. This is why lint-staged appending staged FILE PATHS "just works": each path
// resolves to its owning package/file. No selectors → everything, matching each script's whole-repo default.

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptsDir, '..');
const packagesDir = join(repoRoot, 'packages');

// The positional (non-flag) CLI arguments — the selectors. Flags (`--check`, `-h`, …) are skipped here;
// each script owns its own flag parsing. Package names and paths never start with `-`, so a single-dash
// test safely excludes both `-h` and `--foo`.
export function getSelectors(argv: readonly string[] = process.argv.slice(2)): string[] {
  return argv.filter((arg) => !arg.startsWith('-'));
}

// FILE-operation filter: keep the paths matching any selector by case-insensitive substring on the
// normalized (forward-slash) path. A full file path matches itself; a package dir matches all its files;
// a bare word fans out over any path containing it. Empty selectors → keep everything. This is the shared
// form of the match order.ts previously implemented inline.
export function filterPaths(paths: readonly string[], selectors: readonly string[]): string[] {
  if (selectors.length === 0) return [...paths];
  const needles = selectors.map((selector) => selector.replaceAll('\\', '/').toLowerCase());
  return paths.filter((path) => {
    const haystack = path.replaceAll('\\', '/').toLowerCase();
    return needles.some((needle) => haystack.includes(needle));
  });
}

// Every package directory name under packages/ (the by-folder @flighthq/<name> set).
export function allPackageNames(): string[] {
  return readdirSync(packagesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

// NAME / package-iterating filter: the package folder names matching any selector. A package matches when
// the selector — reduced to its package token (leading `.../packages/` path and `@flighthq/` scope stripped)
// — is a substring of the package name, OR when the selector is a path that points into the package (so a
// staged file path resolves to its owning package). Empty selectors → all packages. Tolerant of bare name,
// `@flighthq/<name>`, `packages/<name>`, a file path, or a substring.
export function selectPackages(selectors: readonly string[], names: readonly string[] = allPackageNames()): string[] {
  if (selectors.length === 0) return [...names];
  return names.filter((name) => selectors.some((selector) => matchesPackageName(name, selector)));
}

// True when `selector` picks the package `name`, tolerant of every selector form. Both sides are reduced to
// their package token (path prefix + `@flighthq/` scope stripped), then matched by substring — or by a
// file-path selector pointing into the package. Shared so name-operations (api) and package-iterating
// file-operations (selectPackages) agree exactly on what a selector means.
export function matchesPackageName(name: string, selector: string): boolean {
  const pkg = toPackageToken(name);
  const token = toPackageToken(selector);
  return pkg.includes(token) || token.startsWith(`${pkg}/`);
}

// Reduces any selector form to the token used for package-name matching: takes the segment after the last
// `packages/` (handles absolute and relative paths, keeping any trailing `<name>/src/...`), then strips a
// leading `@flighthq/` scope, lowercased.
function toPackageToken(selector: string): string {
  const normalized = selector.replaceAll('\\', '/');
  const marker = normalized.lastIndexOf('packages/');
  const afterPackages = marker >= 0 ? normalized.slice(marker + 'packages/'.length) : normalized;
  return afterPackages.replace(/^@flighthq\//, '').toLowerCase();
}
