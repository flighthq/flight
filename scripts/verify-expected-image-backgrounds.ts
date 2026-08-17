// Checks every functional scene's `expectedImageDescription` background claim against THAT SCENE'S OWN
// background constant — never against what the neighbouring scenes happen to use.
//
// ★ THIS EXISTS BECAUSE THE ERROR IT CATCHES IS ALREADY CONFIRMED, AND IT IS NOT CARELESSNESS. A
// description said "an 800x450 opaque black field" for a scene whose background is `0x101018ff`, a
// near-black blue-grey. The author had written several neighbouring scenes in the same family that
// genuinely ARE black and carried the generalisation into the one where it fails. That is much harder to
// catch by re-reading than a typo is: the sentence is fluent, the shape is right, and every other claim
// in it is correct. Only a per-scene comparison against the constant finds it.
//
// ★ AND IT IS A FALSIFIABLE NEGATIVE, WHICH IS WHY IT MATTERS MORE THAN A WORDING SLIP. "The gaps are
// pure black" is exactly the kind of claim a verifier leans on. Held against a real render it either
// fails for a reason that is not a defect, or — worse — silently blesses a render whose background had
// drifted TO true black, which is the drift it should have been catching.
//
// Reads only. Prints a report; exits non-zero if any scene's claim contradicts its own constant.
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface SceneBackgroundClaim {
  scene: string;
  /** The field is present but its text could not be read — reported, never skipped. */
  unparsed?: boolean;
  /** The packed RGBA the scene actually renders on, or `null` if none could be resolved. */
  background: number | null;
  /** What the description says the field is, or `null` where it makes no field-colour claim. */
  claimed: BackgroundTone | null;
  /** What the constant actually is, or `null` when the background could not be resolved. */
  actual: BackgroundTone | null;
}

/**
 * A coarse tone, which is all a description can honestly be checked against.
 *
 * ★ DELIBERATELY COARSE, AND `other` IS A REAL ANSWER RATHER THAN A GAP. A description says "black" or
 * "mid-gray" or "dark navy"; it does not say `0x101018`. Mapping both sides to a few buckets is what
 * makes the two comparable at all. Any colour that does not fall in a named bucket reports as `other`,
 * which is reported as UNVERIFIABLE rather than quietly passing — a check that cannot decide must say so,
 * because a silent pass is indistinguishable from a real one.
 */
export type BackgroundTone = 'black' | 'near-black' | 'mid-gray' | 'white' | 'other';

/** The tone of a packed RGBA background, by the same coarse buckets a description would use. */
export function getBackgroundTone(rgba: number): BackgroundTone {
  const red = (rgba >>> 24) & 255;
  const green = (rgba >>> 16) & 255;
  const blue = (rgba >>> 8) & 255;
  if (red === 0 && green === 0 && blue === 0) return 'black';
  // Near-black covers what a reader would call "very dark": dark enough to read as a backdrop, and NOT
  // black, which is the whole distinction this check exists to hold.
  if (red <= 48 && green <= 48 && blue <= 48) return 'near-black';
  if (red >= 96 && red <= 160 && green >= 96 && green <= 160 && blue >= 96 && blue <= 160) return 'mid-gray';
  if (red >= 240 && green >= 240 && blue >= 240) return 'white';
  return 'other';
}

/**
 * What the description claims the FIELD is — read only from the phrase that names the field or the
 * background, never from the description as a whole.
 *
 * ★ THIS NEARLY ACCUSED THREE OF A PEER'S CORRECT DESCRIPTIONS. The first version matched colour words
 * anywhere in the text, so "every pixel is near-pure black or near-pure white" — a claim about the
 * CONTENT of a checkerboard — was read as a claim that the field is black, and contradicted the scene's
 * genuinely mid-gray background. Three false accusations out of forty, all against texts that were
 * right. A checker that reports a correct description as wrong is worse than no checker: it spends the
 * reader's trust and then costs them the argument.
 *
 * So the tone is read from a window around the words `field` or `background` and from nowhere else. A
 * description that names no field colour returns `null`, which the report prints as NO CLAIM rather
 * than as agreement.
 *
 * A text that says "not pure black" is claiming near-black, not black — the negation has to be read
 * before the phrase it negates, or every honest near-black description reports as a false positive.
 */
export function getClaimedTone(description: string): BackgroundTone | null {
  // Brackets are punctuation, not a boundary: "a near-black (dark blue-gray) field" is one noun
  // phrase, and leaving the parens in truncates the window so the whole phrase reads as no claim.
  const text = description.toLowerCase().replace(/[()[\]]/g, ' ');
  // ★ THE WINDOW IS FOUR WORDS, NOT SIXTY CHARACTERS, BECAUSE ADJACENCY IS THE ONLY EVIDENCE THERE IS.
  // "Two white squares sit on the field, which is mid-gray" put WHITE inside a sixty-character window and
  // the tool called the field white — a colour modifying the CONTENT, read as modifying the field. An
  // adjective four words from its noun is usually not modifying it, and the cases that fall outside the
  // window report as no claim, which costs a human one read and cannot produce a false accusation.
  const phrases = [
    ...[...text.matchAll(/((?:[\w-]+[ ]+){0,4})field\b/g)].map((m) => m[1]!),
    ...[...text.matchAll(/((?:[\w-]+[ ]+){0,4})background\b(?:[ ]+(?:is|of|:)?[ ]*((?:[\w-]+[ ]*){0,3}))?/g)].map(
      (m) => `${m[1]!} ${m[2] ?? ''}`,
    ),
  ];
  // A window may not reach across a clause boundary: an adjective in the previous sentence is not
  // modifying this noun, and letting it through is the wrong-referent failure by a longer route.
  const bounded = phrases.map(
    (phrase) =>
      phrase
        .slice(phrase.lastIndexOf(';') + 1)
        .split(/[.:]/)
        .pop() ?? phrase,
  );
  const found = new Set<BackgroundTone>();
  for (const phrase of bounded) for (const tone of readPhraseTones(phrase)) found.add(tone);
  // ★ TWO ANSWERS IS NO ANSWER. "A black-bordered field of mid-gray" names two tones, and picking the
  // first is how a checker manufactures a contradiction out of its own reading order. Ambiguity reports
  // as no claim, which sends a human to the sentence — the one outcome that cannot be a false accusation.
  return found.size === 1 ? [...found][0]! : null;
}

/**
 * Every tone named in one phrase, reading whole hyphenated tokens and skipping negated ones.
 *
 * ★ HYPHENATED COMPOUNDS ARE ONE WORD. `\bblack\b` matches inside "blue-black", because a hyphen is a
 * word boundary — so a very dark blue-black field reported as claiming BLACK, and would have contradicted
 * its own near-black constant. Tokens are split on whitespace only.
 *
 * ★ A NEGATED COLOUR NAMES NOTHING, RATHER THAN NAMING ITS OPPOSITE. "never black" and "no black
 * anywhere" tell you what the field is not; they do not tell you what it is. The tone has to come from a
 * positive statement elsewhere in the sentence — which is exactly how "a very dark navy background, not
 * pure black" still resolves, from the "very dark navy" and not from the negation.
 */
function readPhraseTones(phrase: string): BackgroundTone[] {
  const tokens = phrase.split(/\s+/).filter(Boolean);
  const tones: BackgroundTone[] = [];
  for (const [index, raw] of tokens.entries()) {
    const token = raw.replace(/[^a-z-]/g, '');
    const tone = TONE_BY_TOKEN[token];
    if (tone === undefined) continue;
    const window = tokens.slice(Math.max(0, index - 3), index).join(' ');
    if (/\b(not|never|no|without|neither|nor)\b/.test(window)) continue;
    // "very dark <anything>" and "dark navy" read as the backdrop being dark, not as the bare colour.
    tones.push(/\bvery dark\b|\bdark\b/.test(window) && tone !== 'mid-gray' ? 'near-black' : tone);
  }
  return tones;
}

/**
 * The tone words this corpus actually uses next to `field` or `background`, not a colour dictionary.
 *
 * ★ IT IS DERIVED FROM THE CORPUS RATHER THAN IMAGINED. Every entry here was found by extracting the
 * words that appear within four tokens of a field/background anchor across every described scene; adding
 * words nobody writes buys nothing, and missing one that eighteen scenes use turns them all into NO
 * CLAIM — coverage that silently is not coverage. When a new word appears, add it, and let the report's
 * NO CLAIM lines tell you which one.
 */
const TONE_BY_TOKEN: Readonly<Record<string, BackgroundTone>> = {
  black: 'black',
  'blue-black': 'near-black',
  'blue-gray': 'near-black',
  'blue-grey': 'near-black',
  charcoal: 'near-black',
  'mid-gray': 'mid-gray',
  'mid-grey': 'mid-gray',
  navy: 'near-black',
  'near-black': 'near-black',
  'pure-black': 'black',
  white: 'white',
};

/** Every scene carrying a description, with its claimed and actual background tone. */
export function readSceneBackgroundClaims(sceneDirectory: string): SceneBackgroundClaim[] {
  const claims: SceneBackgroundClaim[] = [];
  for (const file of readdirSync(sceneDirectory)
    .filter((name) => name.endsWith('.ts'))
    .sort()) {
    const source = readFileSync(join(sceneDirectory, file), 'utf8');
    if (!source.includes('expectedImageDescription')) continue;
    const description = readDescription(source);
    // ★ PRESENT BUT UNREADABLE IS REPORTED, NEVER SKIPPED. Dropping it would shrink the report's
    // population to the scenes the parser happened to cope with, and a sweep over a set it never covered
    // still prints as clean. The count must equal the number of scenes carrying the field.
    if (description === null) {
      claims.push({ actual: null, background: null, claimed: null, scene: file.slice(0, -3), unparsed: true });
      continue;
    }
    const background = readBackground(source);
    claims.push({
      actual: background === null ? null : getBackgroundTone(background),
      background,
      claimed: getClaimedTone(description),
      scene: file.slice(0, -3),
    });
  }
  return claims;
}

/**
 * Which single bucket a scene falls in.
 *
 * ★ THE BUCKETS ARE EXCLUSIVE AND ORDERED, BECAUSE OVERLAPPING ONES DO NOT ADD UP. The first draft
 * counted a scene whose background is outside the named tones as BOTH contradicting and unverifiable,
 * so the report's own totals exceeded its population — the same class of defect as a census whose parts
 * do not sum to its whole. Undecidable is tested first: a tone the tool cannot name cannot contradict
 * anything, and calling it a contradiction would invent a finding out of the tool's own blind spot.
 */
export function classifyBackgroundClaim(
  claim: Readonly<SceneBackgroundClaim>,
): 'unverifiable' | 'no-claim' | 'contradicts' | 'agrees' {
  if (claim.unparsed === true) return 'unverifiable';
  if (claim.background === null || claim.actual === 'other') return 'unverifiable';
  if (claim.claimed === null) return 'no-claim';
  return claim.claimed === claim.actual ? 'agrees' : 'contradicts';
}

export function formatBackgroundClaimReport(claims: readonly Readonly<SceneBackgroundClaim>[]): string {
  const lines: string[] = [];
  const bucket = (name: ReturnType<typeof classifyBackgroundClaim>) =>
    claims.filter((c) => classifyBackgroundClaim(c) === name);
  const contradictions = bucket('contradicts');
  const unverifiable = bucket('unverifiable');
  const silent = bucket('no-claim');
  const agreeing = bucket('agrees');

  for (const claim of contradictions) {
    lines.push(
      `  CONTRADICTS  ${claim.scene}: text says ${claim.claimed}, background ${hex(claim.background)} is ${claim.actual}`,
    );
  }
  // ★ THE POPULATION IS PRINTED WHOLE, NOT JUST ITS FAILURES. A report that lists only contradictions
  // reads as "everything else was checked" when some of it was never decidable — and an unverifiable
  // scene needs a human, not a green tick.
  for (const claim of unverifiable) {
    lines.push(
      claim.unparsed === true
        ? `  UNVERIFIABLE ${claim.scene}: the description is present but could not be parsed`
        : `  UNVERIFIABLE ${claim.scene}: background ${claim.background === null ? 'not resolved' : `${hex(claim.background)} is outside the named tones`}`,
    );
  }
  for (const claim of silent) lines.push(`  NO CLAIM     ${claim.scene}: the description names no field colour`);

  lines.push('');
  lines.push(
    `${claims.length} described scene(s): ${contradictions.length} contradicting, ${unverifiable.length} unverifiable, ` +
      `${silent.length} making no field-colour claim, ${agreeing.length} agreeing`,
  );
  // The tool asserts its own accounting rather than leaving it to the reader's arithmetic.
  const bucketed = contradictions.length + unverifiable.length + silent.length + agreeing.length;
  if (bucketed !== claims.length) {
    lines.push(`accounting: BROKEN — ${bucketed} bucketed vs ${claims.length} scenes seen`);
  }
  return lines.join('\n');
}

/**
 * The description text, however its segments are quoted.
 *
 * ★ IT MUST ACCEPT DOUBLE QUOTES, AND THE COST OF NOT DOING SO WAS INVISIBLE. A segment switches to
 * double quotes the moment its sentence contains an apostrophe — "the square's bottom-right" — and the
 * single-quote-only reader failed to match the WHOLE description, so five scenes were skipped entirely
 * and the report announced a population of 105 out of 110 as though 105 were the population. A hole in a
 * swept set never reports itself; it returns a smaller number that looks like an answer.
 */
function readDescription(source: string): string | null {
  const match = /expectedImageDescription:\s*\n((?:\s*(?:'.*?'|".*?") \+\n)*\s*(?:'.*?'|".*?"),)/.exec(source);
  if (match === null) return null;
  return [...match[1]!.matchAll(/'(.*?)'|"(.*?)"/g)].map((m) => m[1] ?? m[2]).join(' ');
}

/**
 * The background the scene renders on.
 *
 * Reads the literal in the target options, and follows a single constant indirection when the options
 * name one — several scenes write `background: document.backgroundColor ?? BACKGROUND`, where the
 * literal lives on the constant.
 */
function readBackground(source: string): number | null {
  const inline = /background:\s*(0x[0-9a-fA-F]{8})/.exec(source);
  if (inline !== null) return Number(inline[1]);
  const named = /background:[^,\n]*\b([A-Z][A-Z_0-9]*)\b/.exec(source);
  if (named === null) return null;
  const constant = new RegExp(`^const ${named[1]!} = (0x[0-9a-fA-F]{8})`, 'm').exec(source);
  return constant === null ? null : Number(constant[1]);
}

function hex(rgba: number | null): string {
  return rgba === null ? '(unresolved)' : `0x${(rgba >>> 0).toString(16).padStart(8, '0')}`;
}

if (process.argv[1] !== undefined && import.meta.url.endsWith(process.argv[1].replace(/^.*?(?=scripts\/)/, ''))) {
  const scenes = join(dirname(fileURLToPath(import.meta.url)), '..', 'functional', 'scenes');
  const claims = readSceneBackgroundClaims(scenes);
  console.log(formatBackgroundClaimReport(claims));
  if (claims.some((claim) => classifyBackgroundClaim(claim) === 'contradicts')) process.exit(1);
}
