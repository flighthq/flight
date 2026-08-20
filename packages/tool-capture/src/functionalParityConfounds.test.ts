import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  describeFunctionalParityFixtureState,
  findFunctionalParityConfounds,
  findFunctionalSceneClearColor,
  formatFunctionalParityConfoundReport,
  readFunctionalSceneSources,
} from './functionalParityConfounds';

describe('describeFunctionalParityFixtureState', () => {
  it('distinguishes shared, aligned, different, and undeclared fixtures', () => {
    const sources = new Map([
      ['shared', new Map([['*', 'export const scene = true;']])],
      [
        'aligned',
        new Map([
          ['canvas', scene('0x111111ff')],
          ['webgl', scene('0x111111ff')],
        ]),
      ],
      [
        'different',
        new Map([
          ['canvas', scene('0x111111ff')],
          ['webgl', scene('0x222222ff')],
        ]),
      ],
      [
        'undeclared',
        new Map([
          ['canvas', scene('0x111111ff')],
          ['webgl', 'export const scene = true;'],
        ]),
      ],
    ]);

    expect(describeFunctionalParityFixtureState(sources, 'shared', ['canvas', 'webgl'])).toContain('shared source');
    expect(describeFunctionalParityFixtureState(sources, 'aligned', ['canvas', 'webgl'])).toContain('none');
    expect(describeFunctionalParityFixtureState(sources, 'different', ['canvas', 'webgl'])).toContain('YES');
    expect(describeFunctionalParityFixtureState(sources, 'undeclared', ['canvas', 'webgl'])).toContain('unknown');
  });
});

describe('findFunctionalParityConfounds', () => {
  it('reports only per-backend fixtures with different declared clear colours', () => {
    const report = findFunctionalParityConfounds(
      new Map([
        ['shared', new Map([['*', scene('0x333333ff')]])],
        [
          'aligned',
          new Map([
            ['canvas', scene('0x111111ff')],
            ['webgl', scene('0x111111ff')],
          ]),
        ],
        [
          'different',
          new Map([
            ['canvas', scene('0x111111ff')],
            ['webgl', scene('0x222222ff')],
          ]),
        ],
      ]),
    );

    expect(report.comparedPairs).toBe(2);
    expect(report.confounds).toEqual([{ scene: 'different', values: { canvas: '0x111111ff', webgl: '0x222222ff' } }]);
  });
});

describe('findFunctionalSceneClearColor', () => {
  it('reads and normalizes a declared clear colour', () => {
    expect(findFunctionalSceneClearColor(scene('0x0A0C10FF'))).toBe('0x0a0c10ff');
    expect(findFunctionalSceneClearColor('export const state = {};')).toBeNull();
  });
});

describe('formatFunctionalParityConfoundReport', () => {
  it('prints the compared population beside its findings', () => {
    const text = formatFunctionalParityConfoundReport({
      comparedPairs: 4,
      confounds: [{ scene: 'mesh', values: { webgl: '0x000000ff', webgpu: '0x0a0c10ff' } }],
      scenesWithoutDeclaration: 2,
    });

    expect(text).toContain('1 confounded scene(s) of 4 compared');
    expect(text).toContain('mesh  webgl=0x000000ff  webgpu=0x0a0c10ff');
  });
});

describe('readFunctionalSceneSources', () => {
  it('groups backend-specific fixtures and marks a shared source with an asterisk', () => {
    const directory = mkdtempSync(join(tmpdir(), 'parity-confound-'));
    try {
      writeFileSync(join(directory, 'mesh.webgl.ts'), scene('0x000000ff'));
      writeFileSync(join(directory, 'mesh.webgpu.ts'), scene('0x0a0c10ff'));
      writeFileSync(join(directory, 'shape-fill.ts'), 'export const scene = true;');

      const sources = readFunctionalSceneSources(directory);

      expect([...sources.get('mesh')!.keys()].sort()).toEqual(['webgl', 'webgpu']);
      expect([...sources.get('shape-fill')!.keys()]).toEqual(['*']);
    } finally {
      rmSync(directory, { force: true, recursive: true });
    }
  });
});

function scene(color: string): string {
  return `export const state = await createGlRenderState(canvas, { backgroundColor: ${color} });`;
}
