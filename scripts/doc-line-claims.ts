import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// Finds `file.ts:123` claims in the docs library that no longer point at a line the file has.
//
// A doc citing a line number is making a checkable claim, and code moves under it constantly. The
// failure is quiet: the citation still looks authoritative, and a reader who follows it lands on
// whatever now occupies that line — which is worse than a dangling reference, because it is plausible.
//
// ★ TWO CITATION FORMS LOOK ROTTEN TO A NAIVE CHECK AND ARE NOT. Counting them as rot is how a first
// pass over this library reported nearly twice the real number:
//   1. ABBREVIATED paths (`…/canvasTextShaper.ts:61`, `...electronNotification.test.ts:88`) name no
//      resolvable file, so nothing can be said about their line numbers either way.
//   2. COMMIT-PINNED claims ("verified at `screen.ts:604`", alongside a commit hash) are statements
//      about the file AT THAT COMMIT. They are history, and history does not rot.
// Both are reported separately rather than silently dropped, so the skip is visible and reviewable.

// One `path:line` citation found in a doc.
export interface DocLineClaim {
  claimedLine: number;
  docLine: number;
  docPath: string;
  rawPath: string;
}

export type DocLineClaimVerdict = 'abbreviated' | 'commit-pinned' | 'in-range' | 'out-of-range' | 'unresolved';

// Pulls every `path:line` citation out of one doc's text. Ranges (`slot.ts:297-301`) are captured by
// their FIRST line, which is the one a reader jumps to.
export function parseDocLineClaims(docPath: string, text: string): DocLineClaim[] {
  const claims: DocLineClaim[] = [];
  const lines = text.split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    const pattern = /([\w./…-]*[\w-]\.(?:ts|tsx|mjs)):(\d+)/g;
    let match = pattern.exec(lines[index]!);
    while (match !== null) {
      claims.push({
        claimedLine: Number(match[2]),
        docLine: index + 1,
        docPath,
        rawPath: match[1]!,
      });
      match = pattern.exec(lines[index]!);
    }
  }
  return claims;
}

// Whether the surrounding prose pins the claim to a commit, which makes it a statement about history
// rather than about the file as it stands.
// `rawPath` scopes the git-object test to the citation being judged.
//
// ★ THE PIN MUST BE TESTED PER CLAIM, NOT PER LINE, AND THE ERROR RUNS IN THE SILENCING DIRECTION. A
// single doc line often carries several citations, only one of which is revision-qualified. Asking
// merely "does this line contain a hash-prefixed path" then marks every OTHER citation on that line as
// history too, and a skipped claim is never reported as rot — so the check would quietly under-count
// exactly where docs are densest with references.
export function isCommitPinnedClaim(docLineText: string, rawPath?: string): boolean {
  // Prose form: "refresh note commit bd412dd6, verified at `screen.ts:604`".
  if (/\b(?:commit|as of|at)\s+[0-9a-f]{7,40}\b/i.test(docLineText)) return true;
  // Git-object form: `b2824e3d8:packages/bitmap/src/bitmapWarp.ts:670` — a revision-qualified path,
  // which names the file AS IT WAS and cannot rot. The hash must precede THIS citation's path.
  if (rawPath === undefined) return /\b[0-9a-f]{7,40}:[\w./-]+\.(?:ts|tsx|mjs):\d+/.test(docLineText);
  const citationAt = docLineText.indexOf(`${rawPath}:`);
  if (citationAt < 0) return false;
  return /[0-9a-f]{7,40}:$/.test(docLineText.slice(Math.max(0, citationAt - 41), citationAt));
}

// Whether the prose names a package immediately before the citation, as in "`@flighthq/types`
// `index.ts:271`".
//
// ★ WITHOUT THIS, A DOC THAT SAYS WHICH PACKAGE IT MEANS IS RESOLVED AGAINST THE WRONG ONE. Bare
// filenames are normally resolved against the package the doc lives in, which is right until the
// sentence itself overrides it — and `index.ts` exists in nearly every package, so the misresolution
// lands on a real file of the wrong size and reports rot that is not there.
export function packageNamedBeforeClaim(docLineText: string, rawPath: string): string | null {
  const citationAt = docLineText.indexOf(`${rawPath}:`);
  if (citationAt < 0) return null;
  // Only the few characters immediately before the citation count. A package named earlier in a long
  // sentence is discussing something else, and treating it as the target would be a worse guess than
  // the doc's own directory.
  const window = docLineText.slice(Math.max(0, citationAt - 40), citationAt);
  const matches = [...window.matchAll(/@flighthq\/([\w-]+)/g)];
  const last = matches[matches.length - 1];
  return last === undefined ? null : last[1]!;
}

// Turns a cited path into a repo-relative one, or null when it cannot be resolved.
//
// Bare filenames are the common case and are tried FIRST against the package the doc lives in —
// `agents/packages/signals/review.md` citing `slot.ts` means `packages/signals/src/slot.ts`. That
// inference is what makes a bare citation legible to a reader, so the checker makes it too.
//
// ★ THE DOC'S PACKAGE IS A GOOD FIRST GUESS AND A BAD ONLY GUESS, AND ASSUMING IT ALONE HIDES ROT.
// A package's doc routinely cites files that live somewhere else entirely: every exported type is in
// `@flighthq/types`, host backends are in `host-*`, tooling in `tool-*`. Resolving only within the
// citing package files all of those as "not found", which reads as an unjudgeable claim rather than
// as a claim nobody checked — so real rot hides inside the skipped pile. `findByBasename` supplies
// the fallback, and an AMBIGUOUS basename resolves to null rather than to a guess, because picking
// one of several same-named files would invent a verdict about a file nobody cited.
export function resolveDocLineClaimPath(
  rawPath: string,
  docPath: string,
  findByBasename: (basename: string) => readonly string[] = () => [],
  namedPackage: string | null = null,
): string | null {
  // An abbreviated path names no file. Both markers appear in the library.
  if (rawPath.includes('…') || rawPath.includes('...')) return null;

  if (rawPath.startsWith('packages/')) return rawPath;
  const segments = rawPath.split('/').filter((segment) => segment.length > 0);
  if (segments.length === 0) return null;
  // `adjustments/src/colorMatrixMath.ts` — package-relative, missing only the `packages/` root.
  if (segments.length >= 3 && segments[1] === 'src') return `packages/${segments.join('/')}`;
  if (segments.length > 1) return null;

  const basename = segments[0]!;
  // A package named in the sentence beats the package the doc lives in.
  if (namedPackage !== null) {
    const named = `packages/${namedPackage}/src/${basename}`;
    if (findByBasename(basename).includes(named)) return named;
  }
  const packageMatch = /^agents\/packages\/([^/]+)\//.exec(docPath);
  if (packageMatch !== null) {
    const withinPackage = `packages/${packageMatch[1]}/src/${basename}`;
    if (findByBasename(basename).includes(withinPackage)) return withinPackage;
  }
  const candidates = findByBasename(basename);
  return candidates.length === 1 ? candidates[0]! : null;
}

// The verdict for one claim, given the resolved file's line count. `fileLineCount` is null when the
// file does not exist.
//
// ★ A MISSING FILE IS `unresolved`, NOT `out-of-range`. The remedies differ completely — a moved line
// wants the citation corrected, a deleted file wants the claim reconsidered or removed — and merging
// them produces a list nobody can act on without re-deriving the distinction.
export function judgeDocLineClaim(
  claim: Readonly<DocLineClaim>,
  resolvedPath: string | null,
  fileLineCount: number | null,
  docLineText: string,
): DocLineClaimVerdict {
  if (isCommitPinnedClaim(docLineText, claim.rawPath)) return 'commit-pinned';
  if (resolvedPath === null) return 'abbreviated';
  if (fileLineCount === null) return 'unresolved';
  return claim.claimedLine >= 1 && claim.claimedLine <= fileLineCount ? 'in-range' : 'out-of-range';
}

// Walks the docs library and reports every claim by verdict. The counts of the SKIPPED classes are
// printed alongside the rot, so a reader can see what the check declined to judge rather than having
// to trust that the skip was narrow.
export function runDocLineClaimCheck(root: string): {
  abbreviated: number;
  commitPinned: number;
  inRange: number;
  outOfRange: DocLineClaim[];
  unresolved: DocLineClaim[];
} {
  const lineCounts = new Map<string, number | null>();
  const countLines = (path: string): number | null => {
    if (!lineCounts.has(path)) {
      try {
        lineCounts.set(path, readFileSync(path, 'utf8').split('\n').length);
      } catch {
        lineCounts.set(path, null);
      }
    }
    return lineCounts.get(path) ?? null;
  };

  // Every source file in the repo, indexed by basename, so a citation that names a file outside the
  // doc's own package still resolves. Built once.
  const byBasename = new Map<string, string[]>();
  const indexSources = (at: string): void => {
    for (const entry of readdirSync(at)) {
      if (entry === 'node_modules' || entry === 'dist' || entry === '.git') continue;
      const path = join(at, entry);
      if (statSync(path).isDirectory()) indexSources(path);
      else if (/\.(?:ts|tsx|mjs)$/.test(entry)) {
        const list = byBasename.get(entry) ?? [];
        list.push(path);
        byBasename.set(entry, list);
      }
    }
  };
  indexSources('packages');
  const findByBasename = (basename: string): readonly string[] => byBasename.get(basename) ?? [];

  const docs: string[] = [];
  const walk = (at: string): void => {
    for (const entry of readdirSync(at)) {
      const path = join(at, entry);
      if (statSync(path).isDirectory()) walk(path);
      else if (path.endsWith('.md')) docs.push(path);
    }
  };
  walk(root);

  let abbreviated = 0;
  let commitPinned = 0;
  let inRange = 0;
  const outOfRange: DocLineClaim[] = [];
  const unresolved: DocLineClaim[] = [];

  for (const doc of docs.sort()) {
    const text = readFileSync(doc, 'utf8');
    const lines = text.split('\n');
    for (const claim of parseDocLineClaims(doc, text)) {
      const docLineText = lines[claim.docLine - 1] ?? '';
      const resolved = resolveDocLineClaimPath(
        claim.rawPath,
        doc,
        findByBasename,
        packageNamedBeforeClaim(docLineText, claim.rawPath),
      );
      const verdict = judgeDocLineClaim(claim, resolved, resolved === null ? null : countLines(resolved), docLineText);
      if (verdict === 'abbreviated') abbreviated += 1;
      else if (verdict === 'commit-pinned') commitPinned += 1;
      else if (verdict === 'in-range') inRange += 1;
      else if (verdict === 'unresolved') unresolved.push(claim);
      else outOfRange.push(claim);
    }
  }
  return { abbreviated, commitPinned, inRange, outOfRange, unresolved };
}

if (process.argv[1]?.endsWith('doc-line-claims.ts') === true) {
  const result = runDocLineClaimCheck(process.argv[2] ?? 'agents');
  console.log(`  in range: ${result.inRange}`);
  console.log(`  skipped — abbreviated path: ${result.abbreviated}   commit-pinned: ${result.commitPinned}`);
  console.log(`  OUT OF RANGE: ${result.outOfRange.length}`);
  for (const claim of result.outOfRange)
    console.log(`    ${claim.docPath}:${claim.docLine}  cites ${claim.rawPath}:${claim.claimedLine}`);
  console.log(`  UNRESOLVED (file not found): ${result.unresolved.length}`);
  for (const claim of result.unresolved)
    console.log(`    ${claim.docPath}:${claim.docLine}  cites ${claim.rawPath}:${claim.claimedLine}`);
}
