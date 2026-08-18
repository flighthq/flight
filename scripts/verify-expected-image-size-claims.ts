// Checks every functional scene's `expectedImageDescription` for a size claim stated as a FRACTION OF
// THE FRAME with no symbolic derivation behind it — "about a fifth of the frame height across".
//
// ★ THIS EXISTS BECAUSE THE DEFECT IT CATCHES SHIPPED IN 29 CELLS AND SURVIVED A REVIEW. Every one of
// them described a sphere as "about a fifth of the frame height across". The real projected diameter is
// H*tan(asin(0.5/3))/tan(pi/8) = 0.408*H — the text had quoted the scene comment's ~120px RADIUS as the
// whole extent, a factor of two out. The sentence reads fluently, the number is plausible, and nothing
// in it can be checked without redoing the projection, which is precisely why it propagated.
//
// ★ AND THE OBVIOUS CHECK IS THE WRONG ONE, MEASURED BEFORE THIS WAS WRITTEN. A lint over pixel
// quantities — flag `N px` that is neither a source literal nor symbolically derived — is silent here:
// across the same 65 cells the defective text held 16 pixel quantities, all of them direct reads of a
// scene constant, and zero derived ones. The defect never wrote a pixel number at all. A px lint only
// becomes non-empty AFTER the fix, which is the wrong direction for a gate. Inverted, the same
// population separates completely: 29 cells flagged before the corrections, 0 after.
//
// So the rule is: a size stated as a fraction of the frame must be accompanied by the expression that
// produces it, somewhere in the same description. The fraction may stay — "about 245 px across, roughly
// two-fifths of H" is fine — but on its own it is a number nobody can re-derive.
//
// Reads only, and is not part of `npm run check`. Prints a report; exits non-zero if any description
// makes an unquantified frame-relative size claim.
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { DescriptorRecord } from './verify-expected-image-backgrounds';
import { readSceneDescriptors } from './verify-expected-image-backgrounds';

export interface SceneSizeClaim {
  /** Whatever names this descriptor's subject — a scene file today, a cell id under a later shape. */
  subject: string;
  /** The description is present but its text could not be read — reported, never skipped. */
  unparsed?: boolean;
  /** The frame-relative size phrase, or `null` where the description makes no such claim. */
  phrase: string | null;
  /** Whether the description carries an expression a reader could re-derive the size from. */
  derived: boolean;
}

/** Every descriptor, with its frame-relative size claim and whether anything backs it. */
export function analyzeDescriptorSizeClaims(records: readonly Readonly<DescriptorRecord>[]): SceneSizeClaim[] {
  return records.map((record) =>
    record.description === null
      ? { derived: false, phrase: null, subject: record.subject, unparsed: true }
      : {
          derived: hasSymbolicDerivation(record.description),
          phrase: findFrameRelativeSizeClaim(record.description),
          subject: record.subject,
        },
  );
}

/**
 * Which single bucket a scene falls in.
 *
 * The buckets are exclusive and ordered for the same reason the background verifier's are: overlapping
 * buckets produce a report whose parts exceed its population. A description that could not be read
 * cannot be judged, so `unverifiable` is tested first and never doubles as a finding.
 */
export function classifySizeClaim(
  claim: Readonly<SceneSizeClaim>,
): 'unverifiable' | 'no-claim' | 'unquantified' | 'derived' {
  if (claim.unparsed === true) return 'unverifiable';
  if (claim.phrase === null) return 'no-claim';
  return claim.derived ? 'derived' : 'unquantified';
}

/**
 * The frame-relative size phrase a description makes, or `null` for none.
 *
 * ★ THE FRACTION MUST ATTACH TO THE FRAME, AND NOT REQUIRING THAT PRODUCED FOUR FALSE POSITIVES ON THE
 * FIRST RUN. "a half-angle of asin(0.5/2.1213)" and "a quarter-opacity patch" are not size claims at
 * all; a bare fraction-word search reads both as one. The fraction has to modify the frame, the field,
 * the width or the height within a short window, which is what makes this a claim about how big
 * something is rather than about anything else that happens to be a fraction.
 */
export function findFrameRelativeSizeClaim(description: string): string | null {
  const text = description.toLowerCase().replace(/\s+/g, ' ');
  const match = FRAME_RELATIVE_SIZE.exec(text);
  return match === null ? null : match[0].trim();
}

/** A one-line-per-finding report, with the totals it is accountable for. */
export function formatSizeClaimReport(claims: readonly Readonly<SceneSizeClaim>[]): string {
  const lines: string[] = [];
  let unquantified = 0;
  let unverifiable = 0;
  let noClaim = 0;
  let derived = 0;
  for (const claim of claims) {
    switch (classifySizeClaim(claim)) {
      case 'unquantified':
        unquantified++;
        lines.push(`  UNQUANTIFIED ${claim.subject}: "${claim.phrase}" with no expression behind it`);
        break;
      case 'unverifiable':
        unverifiable++;
        lines.push(`  UNVERIFIABLE ${claim.subject}: the description is present but could not be parsed`);
        break;
      case 'no-claim':
        noClaim++;
        break;
      case 'derived':
        derived++;
        lines.push(`  DERIVED      ${claim.subject}: "${claim.phrase}", backed by an expression`);
        break;
    }
  }
  lines.push(
    `\n${claims.length} described scene(s): ${unquantified} unquantified, ${unverifiable} unverifiable, ` +
      `${noClaim} making no frame-relative size claim, ${derived} carrying a derivation`,
  );
  return lines.join('\n');
}

/**
 * Whether the description carries an expression the size can be re-derived from.
 *
 * Deliberately generous about WHERE: anywhere in the same description counts, because a text may state
 * the fraction in its opening sentence and the derivation two sentences later, and splitting hairs over
 * distance would flag correct text. What it will not accept is a bare number — `245 px` alone is not a
 * derivation, which is the entire point.
 */
export function hasSymbolicDerivation(description: string): boolean {
  return SYMBOLIC_FORM.test(description);
}

/** Every scene carrying a description, with its frame-relative size claim. */
export function readSceneSizeClaims(sceneDirectory: string): SceneSizeClaim[] {
  return analyzeDescriptorSizeClaims(readSceneDescriptors(sceneDirectory));
}

// A fraction word bound to the frame, the field, or one of their dimensions, within a short window —
// "a fifth of the frame height", "a quarter of the field width across", "half the width of the frame".
//
// ★ THE NOUN MUST CARRY ITS ARTICLE, WHICH IS WHAT KEEPS A HYPHENATED COMPOUND OUT. "each square shows a
// different quarter of one FOUR-FRAME strip" is a claim about a spritesheet strip, not about the
// rendered surface, and the first version read it as one — a fraction word near the letters `frame`,
// exactly the compound-word trap the background verifier already pays for in `readPhraseTones`. Requiring
// `the frame` / `a field` means the fraction has to modify the surface itself.
const FRAME_RELATIVE_SIZE =
  /\b(?:an?|one|two|three|about|roughly)?\s*(?:a |one )?(?:fifth|quarter|third|half|sixth|eighth|fifths|quarters|thirds)\b(?:[\w ,]{0,20}?)\b(?:the|a|an)\s+(?:frame|field)\b\s*(?:height|width)?|\bhalf the (?:frame |field )?(?:width|height)\b/;

// W and H as symbols, or the trigonometry a projected size comes from. A packed colour literal must not
// count, so the W/H forms require an operator adjacent to the symbol rather than the bare letter.
const SYMBOLIC_FORM = /\b[WH]\s*[*/]|[*/]\s*[WH]\b|\btan\(|\basin\(|\bacos\(|\bsqrt\(|\bcos\(|\bsin\(/;

if (process.argv[1] !== undefined && import.meta.url.endsWith(process.argv[1].replace(/^.*?(?=scripts\/)/, ''))) {
  const scenes = join(dirname(fileURLToPath(import.meta.url)), '..', 'functional', 'scenes');
  const claims = readSceneSizeClaims(scenes);
  console.log(formatSizeClaimReport(claims));
  if (claims.some((claim) => classifySizeClaim(claim) === 'unquantified')) process.exit(1);
}
