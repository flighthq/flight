import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  analyzeDescriptorSizeClaims,
  classifySizeClaim,
  findFrameRelativeSizeClaim,
  formatSizeClaimReport,
  hasSymbolicDerivation,
  readSceneSizeClaims,
} from './verify-expected-image-size-claims';

describe('analyzeDescriptorSizeClaims', () => {
  it('reports a descriptor whose text could not be read rather than dropping it', () => {
    const claims = analyzeDescriptorSizeClaims([{ background: null, description: null, subject: 'broken' }]);

    expect(claims).toEqual([{ derived: false, phrase: null, subject: 'broken', unparsed: true }]);
    expect(classifySizeClaim(claims[0]!)).toBe('unverifiable');
  });

  it('separates a bare fraction from one carrying its derivation', () => {
    const claims = analyzeDescriptorSizeClaims([
      { background: null, description: 'A sphere about a fifth of the frame height across.', subject: 'bare' },
      {
        background: null,
        description:
          'A sphere about 245 px across — D = H*tan(asin(0.5/3))/tan(pi/8) = 0.408*H, two fifths of the frame height.',
        subject: 'derived',
      },
    ]);

    expect(claims.map((claim) => classifySizeClaim(claim))).toEqual(['unquantified', 'derived']);
  });
});

describe('classifySizeClaim', () => {
  it('calls a description with no frame-relative claim no-claim rather than clean', () => {
    expect(classifySizeClaim({ derived: false, phrase: null, subject: 'quiet' })).toBe('no-claim');
  });
});

describe('findFrameRelativeSizeClaim', () => {
  // ★ THE TWO CONTROLS THIS TOOL EXISTS FOR. The first is the real text of the 29 cells that shipped the
  // radius-as-diameter defect; the second is what replaced it. A checker that cannot fail on its own
  // motivating specimen is not a checker, and the corrected form must not be flagged either.
  it('flags the exact phrasing the defect shipped in', () => {
    expect(
      findFrameRelativeSizeClaim(
        'An 800x600 field on a near-black background with a single grey sphere centred in it, about a ' +
          'fifth of the frame height across, lit from the right.',
      ),
    ).toBe('about a fifth of the frame height');
  });

  it('flags the same claim in the other wording the roster missed', () => {
    expect(
      findFrameRelativeSizeClaim(
        'a single matte grey sphere, of moderate size — about a quarter of the frame height across',
      ),
    ).toBe('about a quarter of the frame height');
  });

  // ★ A FRACTION IS NOT A SIZE CLAIM UNLESS IT MODIFIES THE SURFACE. Both of these appeared in real
  // descriptions and both were flagged by the first version: one is an angle, the other an opacity.
  it('does not read a fraction of something else as a size claim', () => {
    expect(findFrameRelativeSizeClaim('a sphere of radius 0.5 subtends a half-angle of asin(0.5/2.1213)')).toBeNull();
    expect(
      findFrameRelativeSizeClaim('a quarter-opacity patch that MATCHES its full-opacity twin is the failure'),
    ).toBeNull();
  });

  // ★ AND A HYPHENATED COMPOUND IS NOT THE NOUN IT ENDS WITH. "a different quarter of one FOUR-FRAME
  // strip" is a claim about a spritesheet strip; requiring the article keeps the compound out.
  it('does not read a hyphenated compound as the rendered surface', () => {
    expect(findFrameRelativeSizeClaim('each square shows a different quarter of one four-frame strip')).toBeNull();
  });
});

describe('formatSizeClaimReport', () => {
  it('accounts for every scene, including the ones it could not decide', () => {
    const report = formatSizeClaimReport([
      { derived: false, phrase: 'a fifth of the frame height', subject: 'bare' },
      { derived: true, phrase: 'two fifths of the frame height', subject: 'derived' },
      { derived: false, phrase: null, subject: 'quiet' },
      { derived: false, phrase: null, subject: 'broken', unparsed: true },
    ]);

    expect(report).toContain('UNQUANTIFIED bare');
    expect(report).toContain(
      '4 described scene(s): 1 unquantified, 1 unverifiable, 1 making no frame-relative size claim, 1 carrying a derivation',
    );
  });
});

describe('hasSymbolicDerivation', () => {
  it('accepts a dimension symbol or the trigonometry a projection comes from', () => {
    expect(hasSymbolicDerivation('D = 0.408*H, so 245 px')).toBe(true);
    expect(hasSymbolicDerivation('x = 0.5*W = 400 px')).toBe(true);
    expect(hasSymbolicDerivation('the boundary follows tan(asin(0.5/3))')).toBe(true);
  });

  it('refuses a bare number, which is the whole point', () => {
    expect(hasSymbolicDerivation('a sphere about 245 px across, centred at (400,300)')).toBe(false);
  });

  // A packed colour carries the letters of no symbol, but a naive `\b[WH]\b` would find neither — this
  // guards the operator requirement rather than the letters.
  it('does not read a colour literal as a derivation', () => {
    expect(hasSymbolicDerivation('on a near-black background (0x0a0c10) with one square')).toBe(false);
  });
});

describe('readSceneSizeClaims', () => {
  it('reads both declaration forms, since the two populations are disjoint', () => {
    const directory = mkdtempSync(join(tmpdir(), 'size-claims-'));
    writeFileSync(
      join(directory, 'called.ts'),
      `declareExpectedImageDescription(\n  'A sphere about a fifth of the frame height across.',\n);\n`,
    );
    writeFileSync(
      join(directory, 'field.ts'),
      [
        'const { render } = await createFunctionalTarget({',
        '  background: 0x000000ff,',
        '  expectedImageDescription:',
        `    'A sphere about a third of the field height across.',`,
        '});',
      ].join('\n'),
    );

    const claims = readSceneSizeClaims(directory);

    expect(claims.map((claim) => claim.subject)).toEqual(['called', 'field']);
    expect(claims.every((claim) => classifySizeClaim(claim) === 'unquantified')).toBe(true);
  });
});
