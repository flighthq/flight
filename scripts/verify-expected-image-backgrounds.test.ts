import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  formatBackgroundClaimReport,
  getBackgroundTone,
  getClaimedTone,
  readSceneBackgroundClaims,
} from './verify-expected-image-backgrounds';

describe('getBackgroundTone', () => {
  // ★ BLACK AND NEAR-BLACK ARE DIFFERENT BUCKETS, WHICH IS THE ENTIRE POINT OF THE CHECK. The confirmed
  // defect was a description calling `0x101018ff` black. If these two collapsed into one tone the tool
  // would report the error as agreement — a checker that cannot fail on its own motivating case.
  it('separates true black from a near-black backdrop', () => {
    expect(getBackgroundTone(0x000000ff)).toBe('black');
    expect(getBackgroundTone(0x101018ff)).toBe('near-black');
  });

  it('names mid-gray and white, and refuses to guess at anything else', () => {
    expect(getBackgroundTone(0x808080ff)).toBe('mid-gray');
    expect(getBackgroundTone(0xffffffff)).toBe('white');
    expect(getBackgroundTone(0x2244ccff)).toBe('other');
  });
});

describe('getClaimedTone', () => {
  it('reads the plain claims', () => {
    expect(getClaimedTone('An 800x600 opaque black field with one square.')).toBe('black');
    expect(getClaimedTone('On a flat opaque mid-gray field, two squares.')).toBe('mid-gray');
    expect(getClaimedTone('A field with three circles.')).toBeNull();
  });

  // ★ THE NEGATION IS READ BEFORE THE PHRASE IT NEGATES. "not pure black" contains "pure black", so a
  // naive match reports every honest near-black description as claiming black — turning the tool's own
  // false positives into the majority of its output and training its reader to ignore it.
  it('reads a negated claim as near-black rather than as black', () => {
    expect(getClaimedTone('An 800x450 field on a near-black background, not pure black, with squares.')).toBe(
      'near-black',
    );
    expect(getClaimedTone('An 800x600 field on a very dark navy background — not pure black.')).toBe('near-black');
    // A description may name the tone rather than negate it: "dark navy" and "dark blue-gray" are what
    // a reader calls the near-black backdrops in this corpus, and a tool that does not know them
    // reports honest descriptions as making NO CLAIM — a silent gap that looks like coverage.
    expect(getClaimedTone('On a dark navy field, a small rectangle.')).toBe('near-black');
    expect(getClaimedTone('On a near-black (dark blue-gray) field, six squares.')).toBe('near-black');
  });
});

describe('getClaimedTone, on the three ways a substring match produces a false accusation', () => {
  // These are the modes an independent naive reimplementation was measured to fail on. Each one here
  // resolves either to the RIGHT tone or to null — never to a confident wrong tone, because the cost of
  // this tool being wrong is a correction sent to someone whose text was right.
  it('does not read a negated colour as a claim, in any of its phrasings', () => {
    expect(getClaimedTone('The background is never black; it is elsewhere described.')).toBeNull();
    expect(getClaimedTone('A field with no black anywhere; the background is mid-gray.')).toBe('mid-gray');
  });

  // A hyphen is a word boundary, so /\bblack\b/ matches inside "blue-black" — and a very dark
  // blue-black field then contradicts its own near-black constant.
  it('reads a hyphenated compound as one word rather than as its last part', () => {
    expect(getClaimedTone('An 800x600 very dark blue-black field with one square.')).toBe('near-black');
    expect(getClaimedTone('An 800x600 blue-black field with one square.')).toBe('near-black');
    expect(getClaimedTone('On a 300x300 pure-black field, a quarter-disk.')).toBe('black');
  });

  it('refuses a colour that modifies the content rather than the field', () => {
    expect(getClaimedTone('Two white squares sit on the field, which is described elsewhere.')).toBeNull();
    expect(getClaimedTone('A black-bordered field of mid-gray.')).toBeNull();
  });

  // Not every second colour word is an ambiguity. Here the field IS black and the white belongs to a
  // square's own background in a later clause — so the right answer is black, reached because the window
  // stops at the clause boundary rather than because the tool guessed well.
  it('reads the field colour when a later clause describes a sub-element', () => {
    expect(getClaimedTone('An opaque black field; the background of the left square is white.')).toBe('black');
  });
});

describe('readSceneBackgroundClaims', () => {
  it('reports a description whose claim contradicts its own scene background', () => {
    const directory = scenes({
      'wrong.ts': scene('0x101018ff', 'An 800x450 opaque black field with six squares.'),
      'right.ts': scene('0x000000ff', 'An 800x600 opaque black field with one square.'),
    });

    const claims = readSceneBackgroundClaims(directory);

    expect(claims.find((c) => c.scene === 'wrong')).toMatchObject({ actual: 'near-black', claimed: 'black' });
    expect(claims.find((c) => c.scene === 'right')).toMatchObject({ actual: 'black', claimed: 'black' });
  });

  // Several scenes write `background: document.backgroundColor ?? BACKGROUND`, so the literal is on the
  // constant. Failing to follow that would report them all as unresolved and bury the real hits.
  it('follows a named background constant', () => {
    const directory = scenes({
      'named.ts': `const BACKGROUND = 0x0c1024ff;\n${scene('document.backgroundColor ?? BACKGROUND', 'A very dark navy background — not pure black.')}`,
    });

    expect(readSceneBackgroundClaims(directory)[0]).toMatchObject({ actual: 'near-black', claimed: 'near-black' });
  });

  it('skips files carrying no description rather than counting them as clean', () => {
    const directory = scenes({ 'bare.ts': 'const WIDTH = 800;\nawait createFunctionalTarget({ width: WIDTH });\n' });

    expect(readSceneBackgroundClaims(directory)).toEqual([]);
  });
});

describe('formatBackgroundClaimReport', () => {
  it('names the contradiction with both sides, so the reader can check the tool', () => {
    const text = formatBackgroundClaimReport([
      { actual: 'near-black', background: 0x101018ff, claimed: 'black', scene: 'particle-emitter.canvas' },
    ]);

    expect(text).toContain('CONTRADICTS  particle-emitter.canvas');
    expect(text).toContain('0x101018ff');
    expect(text).toContain('1 contradicting');
  });

  // ★ THE BUCKETS MUST SUM TO THE POPULATION. A report that lists only contradictions reads as "all the
  // rest were checked" when some were never decidable, and an unverifiable scene needs a human rather
  // than a green tick.
  it('accounts for every scene, including the ones it could not decide', () => {
    const text = formatBackgroundClaimReport([
      { actual: 'black', background: 0x000000ff, claimed: 'black', scene: 'agrees' },
      { actual: 'other', background: 0x2244ccff, claimed: 'black', scene: 'undecidable' },
      { actual: 'black', background: 0x000000ff, claimed: null, scene: 'silent' },
    ]);

    expect(text).toContain('UNVERIFIABLE undecidable');
    expect(text).toContain('NO CLAIM     silent');
    expect(text).toContain(
      '3 described scene(s): 0 contradicting, 1 unverifiable, 1 making no field-colour claim, 1 agreeing',
    );
  });
});

function scene(background: string, description: string): string {
  return [
    'const { render } = await createFunctionalTarget({',
    '  width: WIDTH,',
    `  background: ${background},`,
    '  expectedImageDescription:',
    `    '${description}',`,
    '});',
    '',
  ].join('\n');
}

function scenes(files: Readonly<Record<string, string>>): string {
  const directory = mkdtempSync(join(tmpdir(), 'scene-bg-'));
  mkdirSync(directory, { recursive: true });
  for (const [name, source] of Object.entries(files)) writeFileSync(join(directory, name), source);
  return directory;
}
