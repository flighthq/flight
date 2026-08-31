import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { readCaptureBaselineCoverageManifest } from '../packages/tool-capture/src/captureBaselineCoverageManifest';
import type { FunctionalBackend } from '../packages/tool-capture/src/functionalScene3Ds';
import {
  buildGroups,
  cellGlyph,
  classifyBackendSupport,
  findFunctionalBackendSupport,
  findOrphanedBaselineFingerprints,
  loadBaselineCoverage,
  loadRealizationCoverage,
  renderJson,
  renderMarkdown,
} from './support';

const REPO_ROOT = join(import.meta.dirname, '..');
const FUNCTIONAL_BASELINES = join(REPO_ROOT, 'functional', 'baselines');

function loadBackendObjectCoverage(directory: string): Map<string, Set<FunctionalBackend>> {
  const coverage = new Map<string, Set<FunctionalBackend>>();
  for (const file of readdirSync(directory).filter((name) => name.endsWith('.json'))) {
    const baseline = JSON.parse(readFileSync(join(directory, file), 'utf8')) as Record<string, unknown>;
    coverage.set(
      file.replace(/\.json$/, ''),
      backends(...(['canvas', 'dom', 'webgl', 'webgpu'] as const).filter((backend) => baseline[backend] != null)),
    );
  }
  return coverage;
}

function supportGlyphs(groups: ReturnType<typeof buildGroups>): Map<string, string> {
  return new Map(
    groups.flatMap((group) =>
      group.scenes.flatMap((scene) =>
        scene.backends.map((backend) => [`${scene.scene}/${backend.backend}`, cellGlyph(backend)] as const),
      ),
    ),
  );
}

describe('loadBaselineCoverage', () => {
  it('requires a fingerprint rather than counting a sha256-only backend object', () => {
    const directory = mkdtempSync(join(tmpdir(), 'support-baselines-'));
    try {
      writeFileSync(
        join(directory, 'mixed.json'),
        JSON.stringify({
          canvas: { sha256: 'a'.repeat(64) },
          dom: null,
          webgl: { fingerprint: '1:010203', sha256: 'b'.repeat(64) },
          webgpu: { fingerprintProvenance: { sourceHash: 'c'.repeat(64) } },
        }),
      );

      expect([...loadBaselineCoverage(directory).get('mixed')!]).toEqual(['webgl']);
    } finally {
      rmSync(directory, { force: true, recursive: true });
    }
  });

  it('changes exactly the manifest 90 unpinned identities from ticks to dots, by name', () => {
    const realizations = loadRealizationCoverage();
    const before = supportGlyphs(buildGroups(loadBackendObjectCoverage(FUNCTIONAL_BASELINES), realizations));
    const after = supportGlyphs(buildGroups(loadBaselineCoverage(FUNCTIONAL_BASELINES), realizations));
    const changedIdentities = [...before.keys()]
      .filter((identity) => before.get(identity) !== after.get(identity))
      .sort();
    const manifestRows = readCaptureBaselineCoverageManifest(REPO_ROOT).subjects.functional ?? {};
    const unpinnedIdentities = Object.entries(manifestRows)
      .filter(([, kinds]) => kinds.includes('screenshot') && !kinds.includes('fingerprint'))
      .map(([identity]) => identity)
      .sort();

    expect(changedIdentities).toHaveLength(90);
    expect(changedIdentities).toEqual(unpinnedIdentities);
    for (const identity of changedIdentities) {
      expect([before.get(identity), after.get(identity)]).toEqual(['✓', '·']);
    }
  });
});

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

describe('findOrphanedBaselineFingerprints', () => {
  const bk = (...keys: string[]) => new Set(keys as FunctionalBackend[]);

  it('reports a fingerprint whose scene has no target for that backend', () => {
    // The canvas column was dropped from the scene but its capture stayed behind. The matrix would
    // otherwise render a mark for it, which is a support claim manufactured out of a leftover.
    const orphans = findOrphanedBaselineFingerprints(
      new Map([['effect-x', bk('canvas', 'webgl')]]),
      new Map([['effect-x', bk('webgl')]]),
    );

    expect(orphans).toEqual([{ scene: 'effect-x', backend: 'canvas' }]);
  });

  it('reports every backend of a baseline whose scene does not exist at all', () => {
    // The rename case: a whole baseline file left behind under a name no scene answers to.
    const orphans = findOrphanedBaselineFingerprints(
      new Map([['old-name', bk('webgl', 'webgpu')]]),
      new Map([['new-name', bk('webgl', 'webgpu')]]),
    );

    expect(orphans).toEqual([
      { scene: 'old-name', backend: 'webgl' },
      { scene: 'old-name', backend: 'webgpu' },
    ]);
  });

  it('does NOT report a declared control, which is a scene that renders', () => {
    // A control has a target — it just does not realize the feature. It is evidence about a real
    // render, so it keeps its mark; only evidence with no referent at all is an orphan.
    const orphans = findOrphanedBaselineFingerprints(
      new Map([['effect-y', bk('canvas', 'webgl')]]),
      new Map([['effect-y', bk('canvas', 'webgl')]]),
    );

    expect(orphans).toEqual([]);
  });

  it('does not invent an orphan for a target that has no fingerprint yet', () => {
    // The opposite direction is not this gate's business: an unbaselined target makes no claim.
    const orphans = findOrphanedBaselineFingerprints(
      new Map([['effect-z', bk('webgl')]]),
      new Map([['effect-z', bk('webgl', 'webgpu')]]),
    );

    expect(orphans).toEqual([]);
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
