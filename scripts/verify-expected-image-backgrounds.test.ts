import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  analyzeDescriptorBackgrounds,
  classifyBackgroundClaim,
  formatBackgroundClaimReport,
  getBackgroundTone,
  getClaimedTone,
  readSceneBackgroundClaims,
  readSceneDescriptors,
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

    expect(claims.find((c) => c.subject === 'wrong')).toMatchObject({ actual: 'near-black', claimed: 'black' });
    expect(claims.find((c) => c.subject === 'right')).toMatchObject({ actual: 'black', claimed: 'black' });
  });

  // Several scenes write `background: document.backgroundColor ?? BACKGROUND`, so the literal is on the
  // constant. Failing to follow that would report them all as unresolved and bury the real hits.
  it('follows a named background constant', () => {
    const directory = scenes({
      'named.ts': `const BACKGROUND = 0x0c1024ff;\n${scene('document.backgroundColor ?? BACKGROUND', 'A very dark navy background — not pure black.')}`,
    });

    expect(readSceneBackgroundClaims(directory)[0]).toMatchObject({ actual: 'near-black', claimed: 'near-black' });
  });

  // ★ A SEGMENT SWITCHES TO DOUBLE QUOTES THE MOMENT ITS SENTENCE HAS AN APOSTROPHE. Five real scenes
  // did, the single-quote-only reader failed to match the whole description, and they were dropped from
  // the sweep — the report said "105 described scenes" over a population of 110 and looked complete.
  it('reads a description whose segments are double-quoted', () => {
    const directory = scenes({
      'apostrophe.ts': [
        'const { render } = await createFunctionalTarget({',
        '  background: 0x000000ff,',
        '  expectedImageDescription:',
        `    'On an opaque black field: two squares, one overlapping ' +`,
        `    "the other's bottom-right corner.",`,
        '});',
      ].join('\n'),
    });

    expect(readSceneBackgroundClaims(directory)[0]).toMatchObject({ actual: 'black', claimed: 'black' });
  });

  // ★ THE TWO DECLARATION FORMS ARE DISJOINT POPULATIONS, AND READING ONE SWEPT HALF THE CORPUS. 110
  // scenes declare the description as a functional-target field and 105 call
  // `declareExpectedImageDescription(...)`, with no overlap; the field-only reader reported "110
  // described scene(s)" — true, and quoted as evidence about the other 105, which it had never opened.
  // The scenes that use the call form also build their own render state, so they name the background
  // `backgroundColor`, and reading one spelling would report the whole half as unverifiable instead.
  it('reads a description declared by the call form, whose background is spelled backgroundColor', () => {
    const directory = scenes({
      'declared.ts': [
        'const state = createGlRenderState(canvas, { backgroundColor: 0x101018ff });',
        'declareExpectedImageDescription(',
        `  'An 800x600 opaque black field with one square, ' +`,
        `    'turned by a small angle.',`,
        ');',
      ].join('\n'),
    });

    const claims = readSceneBackgroundClaims(directory);

    expect(claims).toHaveLength(1);
    expect(claims[0]).toMatchObject({ subject: 'declared', actual: 'near-black', claimed: 'black' });
  });

  it('counts both declaration forms in one population', () => {
    const directory = scenes({
      'called.ts': `declareExpectedImageDescription(\n  'An opaque black field.',\n);\nconst s = { backgroundColor: 0x000000ff };`,
      'field.ts': scene('0x000000ff', 'An opaque black field.'),
    });

    expect(readSceneBackgroundClaims(directory).map((claim) => claim.subject)).toEqual(['called', 'field']);
  });

  // A description that is PRESENT but unreadable is a hole in the sweep. Returning it as unverifiable
  // keeps the report's population equal to the number of scenes carrying the field; dropping it silently
  // is how a checker reports a clean run over a set it never covered.
  it('reports an unparsable description rather than dropping it from the population', () => {
    const directory = scenes({
      'broken.ts': 'const x = { expectedImageDescription: someIdentifier };\n',
    });

    const claims = readSceneBackgroundClaims(directory);

    expect(claims).toHaveLength(1);
    expect(claims[0]).toMatchObject({ subject: 'broken', unparsed: true });
    expect(formatBackgroundClaimReport(claims)).toContain('could not be parsed');
  });

  it('skips files carrying no description rather than counting them as clean', () => {
    const directory = scenes({ 'bare.ts': 'const WIDTH = 800;\nawait createFunctionalTarget({ width: WIDTH });\n' });

    expect(readSceneBackgroundClaims(directory)).toEqual([]);
  });
});

describe('formatBackgroundClaimReport', () => {
  it('names the contradiction with both sides, so the reader can check the tool', () => {
    const text = formatBackgroundClaimReport([
      { actual: 'near-black', background: 0x101018ff, claimed: 'black', subject: 'particle-emitter.canvas' },
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
      { actual: 'black', background: 0x000000ff, claimed: 'black', subject: 'agrees' },
      { actual: 'other', background: 0x2244ccff, claimed: 'black', subject: 'undecidable' },
      { actual: 'black', background: 0x000000ff, claimed: null, subject: 'silent' },
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

describe('analyzeDescriptorBackgrounds', () => {
  // ★ THE ANALYSIS IS THE PART THAT MUST SURVIVE A CHANGE OF SOURCE. Every lesson this tool paid for —
  // the field-phrase window, hyphenated compounds, negation, ambiguity, present-but-unreadable — lives
  // here rather than in the scene reader, so the next descriptor shape inherits them instead of
  // relearning them one false accusation at a time. These cases go through NO file at all.
  it('classifies descriptors that never came from a scene file', () => {
    const claims = analyzeDescriptorBackgrounds([
      { background: 0x000000ff, description: 'An opaque black field with one square.', subject: 'cell-a' },
      { background: 0x101018ff, description: 'An opaque black field with six squares.', subject: 'cell-b' },
      { background: 0x808080ff, description: 'On a mid-gray field, two squares.', subject: 'cell-c' },
    ]);

    expect(claims.map((c) => classifyBackgroundClaim(c))).toEqual(['agrees', 'contradicts', 'agrees']);
    expect(claims[1]).toMatchObject({ actual: 'near-black', claimed: 'black', subject: 'cell-b' });
  });

  // A reader signals "descriptor present, could not read it" with a null description. The population must
  // keep it, or the count silently becomes "the ones the parser coped with".
  it('keeps an unreadable descriptor in the population rather than dropping it', () => {
    const claims = analyzeDescriptorBackgrounds([
      { background: null, description: null, subject: 'cell-unreadable' },
      { background: 0x000000ff, description: 'An opaque black field.', subject: 'cell-fine' },
    ]);

    expect(claims).toHaveLength(2);
    expect(claims[0]).toMatchObject({ subject: 'cell-unreadable', unparsed: true });
    expect(classifyBackgroundClaim(claims[0]!)).toBe('unverifiable');
    expect(formatBackgroundClaimReport(claims)).toContain('2 described scene(s)');
  });
});

describe('readSceneDescriptors', () => {
  it('yields one record per scene carrying the field, unreadable ones included', () => {
    const directory = scenes({
      'good.ts': scene('0x000000ff', 'An opaque black field with one square.'),
      'broken.ts': 'const x = { expectedImageDescription: someIdentifier };\n',
      'bare.ts': 'const WIDTH = 800;\n',
    });

    const records = readSceneDescriptors(directory).sort((a, b) => a.subject.localeCompare(b.subject));

    expect(records.map((r) => r.subject)).toEqual(['broken', 'good']);
    expect(records[0]).toMatchObject({ description: null });
    expect(records[1]!.description).toContain('opaque black field');
  });
});
