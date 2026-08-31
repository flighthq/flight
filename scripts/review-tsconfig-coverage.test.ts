import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, test } from 'vitest';

// The root tsconfig lists individual `tools/review/src` files rather than globbing the directory,
// because the rest of that tool is browser code whose DOM types this project does not carry. That
// allowlist is deliberate and must stay one — but it is also maintained by hand, and a scripts test
// that imports a review helper nobody added to it fails the WHOLE-REPO typecheck with TS6307, far from
// the edit that caused it. This guards the invariant the allowlist exists to hold.
//
// TRANSITIVE, NOT JUST DIRECT. TS6307 is raised for every file pulled into the program, so a helper
// reached only through another helper needs an entry too. Checking direct imports alone would pass
// while the typecheck still broke.
const REVIEW_SOURCE_DIRECTORY = resolve(import.meta.dirname, '..', 'tools', 'review', 'src');
const ROOT = resolve(import.meta.dirname, '..');
const SCRIPTS_DIRECTORY = resolve(ROOT, 'scripts');

function reviewModulesReachableFromScripts(): readonly string[] {
  const pending = readdirSync(SCRIPTS_DIRECTORY)
    .filter((file) => file.endsWith('.ts'))
    .flatMap((file) => [
      ...readFileSync(resolve(SCRIPTS_DIRECTORY, file), 'utf8').matchAll(
        /['"]\.\.\/tools\/review\/src\/([A-Za-z0-9_]+)['"]/gu,
      ),
    ])
    .map((match) => match[1]);

  const seen = new Set<string>();
  while (pending.length > 0) {
    const name = pending.pop();
    if (name === undefined || seen.has(name)) continue;
    seen.add(name);
    const source = readFileSync(resolve(REVIEW_SOURCE_DIRECTORY, `${name}.ts`), 'utf8');
    for (const match of source.matchAll(/from\s+['"]\.\/([A-Za-z0-9_]+)['"]/gu)) pending.push(match[1]);
  }
  return [...seen].sort();
}

// The include array is read by extracting its quoted entries rather than by parsing the file as JSON:
// tsconfig.json carries `//` comments, and a comment-stripping pass is a second thing that can be
// wrong about a file whose contents this test is the authority on.
function tsconfigReviewIncludes(): readonly string[] {
  const source = readFileSync(resolve(ROOT, 'tsconfig.json'), 'utf8');
  const include = /"include"\s*:\s*\[([\s\S]*?)\]/u.exec(source);
  expect(include, 'the root tsconfig must declare an include array').not.toBeNull();
  return [...include![1].matchAll(/"tools\/review\/src\/([A-Za-z0-9_]+)\.ts"/gu)].map((match) => match[1]).sort();
}

describe('review helper tsconfig coverage', () => {
  // Equality rather than a subset check, in both directions on purpose. A MISSING entry is the failure
  // that already happened — `reviewManifest`/`reviewManifestPlugin` were imported by a scripts test and
  // absent from the list, breaking the repo typecheck. An EXTRA entry is a file the allowlist still
  // carries after nothing imports it, which quietly widens a boundary the comment says is narrow.
  test('lists exactly the review helpers reachable from scripts', () => {
    expect(tsconfigReviewIncludes()).toEqual(reviewModulesReachableFromScripts());
  });

  // The closure must actually be doing work — if the traversal silently found nothing, the equality
  // above would be satisfied by two empty lists and this file would guard nothing at all.
  //
  // As measured today every reachable helper is ALSO imported directly by some scripts file, so the
  // transitive step currently adds nothing. It is kept because TS6307 does not care how a file entered
  // the program: the first helper reached only through another one would break the repo typecheck, and
  // a direct-imports-only check would pass while it did.
  test('resolves a non-empty closure over the review helpers', () => {
    const reachable = reviewModulesReachableFromScripts();
    expect(reachable.length).toBeGreaterThan(0);
    expect(reachable).toContain('reviewManifest');
    expect(reachable).toContain('reviewManifestPlugin');
  });
});
