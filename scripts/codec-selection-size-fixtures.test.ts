import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

// The pairs that measure what selecting one codec saves over taking a format family's whole registry.
//
// ★ WHY THESE PAIRS EXIST AT ALL. The manifest plugin used to carry analyzers for these families: a build-time
// answer to "which variant is this document?", generated into a module naming the one descriptor the content
// needed. The answer was worthless, because the only way to install a chosen descriptor is the family's applier,
// the applier reaches the registry initializer, and the initializer seeds the FULL preset — so a build that asked
// for one format linked every sibling codec while believing it had paid for one. The analyzers are gone; these
// fixtures are the number that says why, and the guard that stops the claim from rotting into prose.
const PAIRS: readonly (readonly [string, string, string])[] = [
  ['spritesheet', 'spritesheet-codec-one', 'spritesheet-codec-all'],
  ['bitmapfont', 'bitmapfont-codec-one', 'bitmapfont-codec-all'],
];

const root = resolve(import.meta.dirname, '..');
const fixturesDir = join(root, 'tools', 'size', 'fixtures');

describe('codec selection size fixtures', () => {
  // ★ THE INEQUALITY IS THE CLAIM, NOT THE ABSOLUTE BYTES. Absolute numbers move with every dependency; what must
  // stay true is that naming one codec costs strictly less than taking the family. If that stops holding, direct
  // selection has stopped being worth recommending and the comment above has become false.
  it.each(PAIRS)('measures %s selection as strictly cheaper than the whole family', (_family, one, all) => {
    for (const baseline of ['size.baseline.json', 'size.unminified.baseline.json']) {
      const sizes = readBaseline(baseline);
      const oneBytes = sizes[`${one}:canvas`];
      const allBytes = sizes[`${all}:canvas`];
      expect(oneBytes, `${one} missing from ${baseline}`).toBeGreaterThan(0);
      expect(allBytes, `${all} missing from ${baseline}`).toBeGreaterThan(0);
      expect(oneBytes, `${one} vs ${all} in ${baseline}`).toBeLessThan(allBytes);
    }
  });

  // A margin, not just an inequality: a saving inside the harness's own noise band would be a rounding artifact
  // rather than a reason to select directly. A fifth is far above that band and far below the measured ratios
  // (spritesheet 4.3x minified, bitmap font 2.1x), so this fails on a real regression without pinning a number
  // that drifts with every dependency.
  it.each(PAIRS)('keeps the %s saving large enough to be a reason rather than noise', (_family, one, all) => {
    const sizes = readBaseline('size.baseline.json');
    expect(sizes[`${one}:canvas`] * 1.2).toBeLessThan(sizes[`${all}:canvas`]);
  });

  // ★ THE FIXTURES MUST KEEP MEASURING WHAT THEY CLAIM. A one-codec fixture that reached for the applier, or an
  // all-codecs fixture that stopped reaching for it, would leave the pair reporting two numbers whose difference
  // means something else — and the inequality above would still pass.
  it.each(PAIRS)('holds %s to one direct codec import against one registry install', (_family, one, all) => {
    const oneSource = readFixtureSource(one);
    expect(oneSource, one).not.toContain('ImportOptions');
    expect(oneSource, one).not.toContain('AllFormats');

    const allSource = readFixtureSource(all);
    expect(allSource, all).toContain('ImportOptions');
    expect(allSource, all).toContain('AllFormats');
  });
});

function readBaseline(name: string): Record<string, number> {
  return JSON.parse(readFileSync(join(root, 'tools', 'size', name), 'utf8')) as Record<string, number>;
}

// The fixture's CODE, with comment lines stripped. The one-codec fixture's comment names the applier in order to
// explain why it does not use it, and an assertion that read the prose would have failed on the explanation.
function readFixtureSource(fixture: string): string {
  return readFileSync(join(fixturesDir, fixture, 'src', 'render.canvas.ts'), 'utf8')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('//'))
    .join('\n');
}
