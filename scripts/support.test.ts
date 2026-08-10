import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { FunctionalBackend } from '../packages/tool-capture/src/functionalScene3Ds';
import {
  buildGroups,
  classifyBackendSupport,
  findFunctionalBackendSupport,
  loadRealizationCoverage,
  renderJson,
  renderMarkdown,
} from './support';

describe('buildGroups', () => {
  it('keeps fingerprint and realization as separate facts', () => {
    const groups = buildGroups(
      new Map([
        ['effect-control', backends('canvas', 'webgl')],
        ['effect-uncaptured', backends('webgl')],
      ]),
      new Map([
        ['effect-control', backends('webgl')],
        ['effect-uncaptured', backends('canvas', 'webgl')],
      ]),
    );

    const control = groups[0].scenes.find((scene) => scene.scene === 'effect-control')!;
    expect(control.backends.find((backend) => backend.backend === 'canvas')).toMatchObject({
      fingerprinted: true,
      realization: false,
      status: 'control',
    });
    expect(control.backends.find((backend) => backend.backend === 'webgl')).toMatchObject({
      fingerprinted: true,
      realization: true,
      status: 'realized',
    });

    const uncaptured = groups[0].scenes.find((scene) => scene.scene === 'effect-uncaptured')!;
    expect(uncaptured.backends.find((backend) => backend.backend === 'canvas')).toMatchObject({
      fingerprinted: false,
      realization: true,
      status: 'unbaselined',
    });
  });
});

describe('classifyBackendSupport', () => {
  it('requires both a fingerprint and realization for support', () => {
    expect(classifyBackendSupport(true, true)).toBe('realized');
    expect(classifyBackendSupport(true, false)).toBe('control');
    expect(classifyBackendSupport(false, true)).toBe('unbaselined');
    expect(classifyBackendSupport(false, false)).toBe('unbaselined');
  });
});

describe('findFunctionalBackendSupport', () => {
  it('finds a colocated control declaration', () => {
    expect(findFunctionalBackendSupport("export const functionalBackendSupport = 'control' as const;\n")).toBe(
      'control',
    );
  });

  it('rejects an unknown declaration instead of silently ticking it', () => {
    expect(() => findFunctionalBackendSupport("export const functionalBackendSupport = 'partial';\n")).toThrow(
      "Unknown functionalBackendSupport value 'partial'",
    );
  });

  it('returns null when a scene needs no exception', () => {
    expect(findFunctionalBackendSupport('export const width = 800;\n')).toBeNull();
  });
});

describe('loadRealizationCoverage', () => {
  it('derives targets from scene discovery and removes declared controls', () => {
    const directory = mkdtempSync(join(tmpdir(), 'support-scenes-'));
    try {
      writeFileSync(join(directory, 'generic.ts'), 'export const width = 800;\n');
      writeFileSync(
        join(directory, 'split.canvas.ts'),
        "export const functionalBackendSupport = 'control' as const;\n",
      );
      writeFileSync(join(directory, 'split.webgl.ts'), 'export const width = 800;\n');

      const coverage = loadRealizationCoverage(directory);

      expect([...coverage.get('generic')!].sort()).toEqual(['canvas', 'dom', 'webgl', 'webgpu']);
      expect([...coverage.get('split')!]).toEqual(['webgl']);
    } finally {
      rmSync(directory, { force: true, recursive: true });
    }
  });
});

describe('renderJson', () => {
  it('emits the three-state vocabulary without discarding either evidence axis', () => {
    const groups = buildGroups(
      new Map([['effect-control', backends('canvas')]]),
      new Map([['effect-control', backends()]]),
    );

    const json = JSON.parse(renderJson(groups)) as {
      areas: { scenes: { backends: Record<string, unknown> }[] }[];
      schemaVersion: number;
    };
    expect(json.schemaVersion).toBe(2);
    expect(json.areas[0].scenes[0].backends.canvas).toEqual({
      status: 'control',
      fingerprint: true,
      realization: false,
    });
  });
});

describe('renderMarkdown', () => {
  it('renders a captured control distinctly from a tick and an unbaselined dot', () => {
    const groups = buildGroups(
      new Map([['effect-control', backends('canvas', 'webgl')]]),
      new Map([['effect-control', backends('webgl')]]),
    );

    const markdown = renderMarkdown(groups);
    expect(markdown).toContain('| `effect-control` | ⊘ | · | ✓ | · |');
    expect(markdown).toContain('Captured controls');
  });
});

function backends(...values: FunctionalBackend[]): Set<FunctionalBackend> {
  return new Set(values);
}
