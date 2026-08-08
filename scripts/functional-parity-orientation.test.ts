import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { parseBitmapFingerprint } from '@flighthq/bitmap/contract';

import {
  findFunctionalOrientationDisagreements,
  formatFunctionalOrientationReport,
  mirrorBitmapFingerprintVertically,
  readFunctionalBaselineFingerprints,
} from './functional-parity-orientation';

// Built from synthetic fingerprints rather than the committed baselines, so the check keeps working
// when a baseline is re-captured and still runs where the render suite cannot.

describe('findFunctionalOrientationDisagreements', () => {
  it('reports a pair that agrees only once one side is mirrored', () => {
    const top = gradient();
    const report = findFunctionalOrientationDisagreements(
      new Map([
        [
          'fog',
          new Map([
            ['webgl', top],
            ['webgpu', flip(top)],
          ]),
        ],
      ]),
    );

    expect(report.comparedPairs).toBe(1);
    expect(report.findings).toHaveLength(1);
    expect(report.findings[0]!.mirrored).toBeLessThan(report.findings[0]!.direct);
  });

  it('does not report a pair that already agrees', () => {
    const top = gradient();
    const report = findFunctionalOrientationDisagreements(
      new Map([
        [
          'fog',
          new Map([
            ['webgl', top],
            ['webgpu', top],
          ]),
        ],
      ]),
    );

    // Identical renders must not be read as a mirror just because mirroring cannot make them worse.
    expect(report.findings).toEqual([]);
    expect(report.comparedPairs).toBe(1);
  });

  it('does not report a pair that disagrees in content rather than orientation', () => {
    // A vertically SYMMETRIC difference is unchanged by mirroring, so it is a content disagreement.
    const report = findFunctionalOrientationDisagreements(
      new Map([
        [
          'solid',
          new Map([
            ['webgl', solid('00')],
            ['webgpu', solid('ff')],
          ]),
        ],
      ]),
    );

    expect(report.findings).toEqual([]);
    expect(report.comparedPairs).toBe(1);
  });

  it('separates finding nothing from having nothing to compare', () => {
    const empty = findFunctionalOrientationDisagreements(new Map());
    const single = findFunctionalOrientationDisagreements(new Map([['fog', new Map([['webgl', gradient()]])]]));

    expect(empty.comparedPairs).toBe(0);
    expect(single.comparedPairs).toBe(0);
    expect(single.scenesWithoutPair).toBe(1);
  });
});

describe('formatFunctionalOrientationReport', () => {
  it('prints the compared-pair count beside an empty finding', () => {
    expect(formatFunctionalOrientationReport({ comparedPairs: 0, findings: [], scenesWithoutPair: 0 })).toContain(
      '0 scene(s) of 0 compared pair(s)',
    );
  });

  it('prints both distances so the reader sees how much mirroring recovered', () => {
    const text = formatFunctionalOrientationReport({
      comparedPairs: 311,
      findings: [{ backends: ['webgl', 'webgpu'], direct: 46.14, mirrored: 10.31, scene: 'effect-fog' }],
      scenesWithoutPair: 16,
    });

    expect(text).toContain('effect-fog  webgl·webgpu  direct 46.14  mirrored 10.31');
  });
});

describe('mirrorBitmapFingerprintVertically', () => {
  it('reverses row order and leaves each row intact', () => {
    const mirrored = mirrorBitmapFingerprintVertically(
      parseBitmapFingerprint(`2:${'ff0000' + '00ff00'}${'0000ff' + 'ffffff'}`)!,
    );

    expect([...mirrored.cells]).toEqual([0x00, 0x00, 0xff, 0xff, 0xff, 0xff, 0xff, 0x00, 0x00, 0x00, 0xff, 0x00]);
  });

  it('is its own inverse', () => {
    const original = parseBitmapFingerprint(gradient())!;
    const roundTrip = mirrorBitmapFingerprintVertically(mirrorBitmapFingerprintVertically(original));

    expect([...roundTrip.cells]).toEqual([...original.cells]);
  });
});

describe('readFunctionalBaselineFingerprints', () => {
  it('groups each backend fingerprint under its scene and ignores columns carrying none', () => {
    const directory = mkdtempSync(join(tmpdir(), 'parity-orientation-'));
    try {
      writeFileSync(
        join(directory, 'effect-fog.json'),
        JSON.stringify({ canvas: { note: 'no fingerprint' }, webgl: { fingerprint: gradient() } }),
      );
      writeFileSync(join(directory, 'notes.txt'), 'ignored');

      const scenes = readFunctionalBaselineFingerprints(directory);

      expect([...scenes.keys()]).toEqual(['effect-fog']);
      expect([...scenes.get('effect-fog')!.keys()]).toEqual(['webgl']);
    } finally {
      rmSync(directory, { force: true, recursive: true });
    }
  });
});

// A vertical ramp: mirroring it changes every row, which is what an orientation disagreement looks like.
function gradient(): string {
  const size = 4;
  let hex = '';
  for (let row = 0; row < size; row++) {
    const value = (row * 80).toString(16).padStart(2, '0');
    for (let column = 0; column < size; column++) hex += value + value + value;
  }
  return `${size}:${hex}`;
}

function solid(value: string): string {
  const size = 4;
  return `${size}:${(value + value + value).repeat(size * size)}`;
}

function flip(text: string): string {
  const parsed = mirrorBitmapFingerprintVertically(parseBitmapFingerprint(text)!);
  return `${parsed.gridSize}:${[...parsed.cells].map((cell) => cell.toString(16).padStart(2, '0')).join('')}`;
}
