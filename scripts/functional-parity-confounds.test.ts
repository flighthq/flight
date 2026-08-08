import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  findFunctionalParityConfounds,
  findFunctionalSceneClearColor,
  formatFunctionalParityConfoundReport,
  readFunctionalSceneSources,
} from './functional-parity-confounds';

// These run on synthetic fixtures rather than the scene tree, so the check stays valid when scenes are
// added or aligned — and so a run in an environment without the scene tree still exercises the logic.

describe('findFunctionalParityConfounds', () => {
  it('reports a scene whose backends declare different clear colours', () => {
    const report = findFunctionalParityConfounds(
      new Map([
        [
          'mesh',
          new Map([
            ['webgl', scene('0x000000ff')],
            ['webgpu', scene('0x0a0c10ff')],
          ]),
        ],
      ]),
    );

    expect(report.comparedPairs).toBe(1);
    expect(report.confounds).toEqual([{ scene: 'mesh', values: { webgl: '0x000000ff', webgpu: '0x0a0c10ff' } }]);
  });

  it('reports no confound when both backends declare the same clear colour', () => {
    const report = findFunctionalParityConfounds(
      new Map([
        [
          'mesh',
          new Map([
            ['webgl', scene('0x0a0c10ff')],
            ['webgpu', scene('0x0A0C10FF')],
          ]),
        ],
      ]),
    );

    // Case is normalised, so a fixture written in upper case is agreement rather than a false finding.
    expect(report.confounds).toEqual([]);
    expect(report.comparedPairs).toBe(1);
  });

  it('does not compare a scene whose second backend declares no clear colour', () => {
    const report = findFunctionalParityConfounds(
      new Map([
        [
          'mesh',
          new Map([
            ['webgl', scene('0x000000ff')],
            ['webgpu', 'export const state = {};'],
          ]),
        ],
      ]),
    );

    // An undeclared fixture must not read as agreeing with a declared one.
    expect(report.confounds).toEqual([]);
    expect(report.comparedPairs).toBe(0);
    expect(report.scenesWithoutDeclaration).toBe(1);
  });

  it('separates finding nothing from having nothing to compare', () => {
    const empty = findFunctionalParityConfounds(new Map());
    const compared = findFunctionalParityConfounds(
      new Map([
        [
          'mesh',
          new Map([
            ['webgl', scene('0x1122ffff')],
            ['webgpu', scene('0x1122ffff')],
          ]),
        ],
      ]),
    );

    // Both find zero confounds. Only the compared-pair count distinguishes an all-clear from a scan
    // that had nothing to look at, which is why the formatter prints it beside the findings.
    expect(empty.confounds).toEqual([]);
    expect(compared.confounds).toEqual([]);
    expect(empty.comparedPairs).toBe(0);
    expect(compared.comparedPairs).toBe(1);
  });
});

describe('findFunctionalSceneClearColor', () => {
  it('reads the declared clear colour', () => {
    expect(findFunctionalSceneClearColor(scene('0x0a0c10ff'))).toBe('0x0a0c10ff');
  });

  it('returns null when the fixture declares none', () => {
    expect(findFunctionalSceneClearColor('export const state = createGlRenderState(canvas);')).toBeNull();
  });
});

describe('formatFunctionalParityConfoundReport', () => {
  it('prints the compared-pair count beside an empty finding', () => {
    const text = formatFunctionalParityConfoundReport({
      comparedPairs: 0,
      confounds: [],
      scenesWithoutDeclaration: 0,
    });

    expect(text).toContain('0 confounded scene(s) of 0 compared');
  });

  it('prints each confounded scene with both declared values', () => {
    const text = formatFunctionalParityConfoundReport({
      comparedPairs: 4,
      confounds: [{ scene: 'mesh-plane', values: { webgl: '0x000000ff', webgpu: '0x0a0c10ff' } }],
      scenesWithoutDeclaration: 2,
    });

    expect(text).toContain('mesh-plane  webgl=0x000000ff  webgpu=0x0a0c10ff');
    expect(text).toContain('1 confounded scene(s) of 4 compared');
  });
});

describe('readFunctionalSceneSources', () => {
  it('groups every backend fixture under its scene name', () => {
    const directory = mkdtempSync(join(tmpdir(), 'parity-confound-'));
    try {
      writeFileSync(join(directory, 'mesh-plane.webgl.ts'), scene('0x000000ff'));
      writeFileSync(join(directory, 'mesh-plane.webgpu.ts'), scene('0x0a0c10ff'));
      writeFileSync(join(directory, 'shape-fill.canvas.ts'), scene('0x111111ff'));

      const sources = readFunctionalSceneSources(directory);

      expect([...sources.keys()].sort()).toEqual(['mesh-plane', 'shape-fill']);
      expect([...sources.get('mesh-plane')!.keys()].sort()).toEqual(['webgl', 'webgpu']);
    } finally {
      rmSync(directory, { force: true, recursive: true });
    }
  });
});

function scene(color: string): string {
  return `export const state = await createGlRenderState(canvas, { backgroundColor: ${color} });`;
}
