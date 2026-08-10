import { describe, expect, it } from 'vitest';

import {
  isCommitPinnedClaim,
  judgeDocLineClaim,
  packageNamedBeforeClaim,
  parseDocLineClaims,
  resolveDocLineClaimPath,
} from './doc-line-claims';

const claim = { claimedLine: 60, docLine: 1, docPath: 'agents/packages/texture/status.md', rawPath: 'cubeTexture.ts' };

describe('isCommitPinnedClaim', () => {
  it('recognizes a claim pinned to a commit as history rather than rot', () => {
    expect(isCommitPinnedClaim('refresh note commit bd412dd6, verified at `screen.ts:604`')).toBe(true);
    expect(isCommitPinnedClaim('as of 1a2b3c4d the slot list is spliced')).toBe(true);
  });

  it('does not treat an ordinary citation as pinned', () => {
    // Over-matching here would silence real rot, which is the more expensive direction of the two.
    expect(isCommitPinnedClaim('the once path splices directly (`slot.ts:297`)')).toBe(false);
    expect(isCommitPinnedClaim('see the 2026-07-02 charter decision')).toBe(false);
  });
});

describe('judgeDocLineClaim', () => {
  it('separates a missing file from a moved line', () => {
    // The remedies differ: a moved line wants the citation corrected, a deleted file wants the claim
    // reconsidered. Collapsing them yields a list nobody can act on.
    expect(judgeDocLineClaim(claim, 'packages/texture/src/cubeTexture.ts', null, '')).toBe('unresolved');
    expect(judgeDocLineClaim(claim, 'packages/texture/src/cubeTexture.ts', 59, '')).toBe('out-of-range');
    expect(judgeDocLineClaim(claim, 'packages/texture/src/cubeTexture.ts', 60, '')).toBe('in-range');
  });

  it('reports the two false-positive classes as themselves, not as rot', () => {
    expect(judgeDocLineClaim(claim, null, null, '')).toBe('abbreviated');
    expect(judgeDocLineClaim(claim, 'packages/x/src/y.ts', 1, 'verified at commit abcdef1')).toBe('commit-pinned');
  });

  it('treats the last line of the file as in range', () => {
    // An off-by-one here would manufacture rot at the end of every file it checked.
    expect(judgeDocLineClaim({ ...claim, claimedLine: 59 }, 'packages/texture/src/cubeTexture.ts', 59, '')).toBe(
      'in-range',
    );
  });
});

describe('parseDocLineClaims', () => {
  it('finds citations in prose and inside backticks', () => {
    const claims = parseDocLineClaims('d.md', 'see `slot.ts:297` and throttle.ts:55 for the alias');
    expect(claims.map((entry) => entry.rawPath)).toEqual(['slot.ts', 'throttle.ts']);
    expect(claims.map((entry) => entry.claimedLine)).toEqual([297, 55]);
  });

  it('captures a range by its first line, which is where a reader lands', () => {
    expect(parseDocLineClaims('d.md', '`slot.ts:297-301`')[0]!.claimedLine).toBe(297);
  });

  it('records the doc line so a finding can be acted on without a search', () => {
    expect(parseDocLineClaims('d.md', 'no claim here\nsecond `a.ts:5`')[0]!.docLine).toBe(2);
  });

  it('ignores prose that is not a file citation', () => {
    expect(parseDocLineClaims('d.md', 'the ratio was 3:1 and the time 10:30')).toEqual([]);
  });
});

describe('resolveDocLineClaimPath', () => {
  it('resolves a bare filename against the package the DOC lives in', () => {
    // This inference is what makes a bare citation legible to a reader, so the checker must make it too.
    expect(
      resolveDocLineClaimPath('slot.ts', 'agents/packages/signals/review.md', () => ['packages/signals/src/slot.ts']),
    ).toBe('packages/signals/src/slot.ts');
  });

  it('falls back to a repo-wide lookup when the file lives outside the citing package', () => {
    // ★ The case that hides rot: a package's doc citing a type, which lives in @flighthq/types rather
    // than in that package. Resolving only within the package files it as "not found", which reads as
    // unjudgeable rather than as unchecked.
    expect(
      resolveDocLineClaimPath('ClipRegion.ts', 'agents/packages/clip/status.md', () => [
        'packages/types/src/ClipRegion.ts',
      ]),
    ).toBe('packages/types/src/ClipRegion.ts');
  });

  it('refuses an ambiguous basename rather than picking one', () => {
    // Two files share the name; choosing either invents a verdict about a file nobody cited.
    expect(
      resolveDocLineClaimPath('index.ts', 'agents/x.md', () => ['packages/a/src/index.ts', 'packages/b/src/index.ts']),
    ).toBeNull();
  });

  it('completes a package-relative path and passes a repo-relative one through', () => {
    expect(resolveDocLineClaimPath('adjustments/src/colorMatrixMath.ts', 'agents/x.md')).toBe(
      'packages/adjustments/src/colorMatrixMath.ts',
    );
    expect(resolveDocLineClaimPath('packages/app/src/app.ts', 'agents/x.md')).toBe('packages/app/src/app.ts');
  });

  it('refuses an abbreviated path in either marker rather than guessing a file', () => {
    // Both spellings appear in the library, and a guess here invents rot in a file nobody cited.
    expect(resolveDocLineClaimPath('…/canvasTextShaper.ts', 'agents/x.md')).toBeNull();
    expect(resolveDocLineClaimPath('...electronNotification.test.ts', 'agents/x.md')).toBeNull();
  });

  it('refuses a bare filename when the doc is not inside a package', () => {
    // Nothing names the package, so any resolution would be invented.
    expect(resolveDocLineClaimPath('slot.ts', 'agents/conventions/testing.md', () => [])).toBeNull();
  });
});

describe('isCommitPinnedClaim per claim', () => {
  const line = 'see `b2824e3d8:packages/bitmap/src/bitmapNoise.ts:200` and also `slot.ts:95` today';

  it('pins only the citation the hash actually precedes', () => {
    // ★ The silencing bug this guards: asking per LINE marks every other citation on a dense line as
    // history too, and a skipped claim is never reported as rot. Scoping it per claim recovered a real
    // out-of-range citation that the per-line form had swallowed.
    expect(isCommitPinnedClaim(line, 'packages/bitmap/src/bitmapNoise.ts')).toBe(true);
    expect(isCommitPinnedClaim(line, 'slot.ts')).toBe(false);
  });

  it('still recognizes the prose form, which applies to the whole sentence', () => {
    expect(isCommitPinnedClaim('verified at commit bd412dd6 in `screen.ts:604`', 'screen.ts')).toBe(true);
  });
});

describe('packageNamedBeforeClaim', () => {
  it('takes the package the sentence names over the one the doc lives in', () => {
    // `index.ts` exists in nearly every package, so misresolving it lands on a real file of the wrong
    // size and reports rot that is not there.
    expect(packageNamedBeforeClaim('`@flighthq/types` `index.ts:271-272`', 'index.ts')).toBe('types');
  });

  it('ignores a package named far away from the citation', () => {
    const far = '@flighthq/mesh is discussed at length here, and separately the file `index.ts:5` matters';
    expect(packageNamedBeforeClaim(far, 'index.ts')).toBeNull();
  });
});
