import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  collectNodeConstructorCandidates,
  collectNodeKindChokepointSites,
  collectNodeKindConstants,
  collectNodeMintingPackages,
  createNodeKindCensusReport,
  formatNodeKindCensusReport,
  hasNodeKindCensusFailure,
  isKindPreservingConstructor,
} from './node-kind-census-core';
import type { NodeKindProbeOutcome } from './node-kind-census-core';

describe('collectNodeConstructorCandidates', () => {
  it('reaches a constructor that only wraps another constructor, which a hand-listed set would miss', () => {
    // createOuter never names a chokepoint; it is a candidate only because createInner is one. This is the
    // shape a future createLodMesh would take on top of createMesh.
    const file = fixture(
      'wrap.ts',
      `import { createNode2D } from '@flighthq/scene2d/contract';
       export function createInner() { return createNode2D(InnerKind); }
       export function createOuter() { return createInner(); }
       export function createUnrelated() { return {}; }`,
    );
    const candidates = collectNodeConstructorCandidates([file]);
    expect(candidates).toContain('createInner');
    expect(candidates).toContain('createOuter');
    expect(candidates).not.toContain('createUnrelated');
  });
});

describe('collectNodeKindChokepointSites', () => {
  it('resolves a literal kind constant passed straight to a chokepoint', () => {
    const sites = collectNodeKindChokepointSites(
      new Map([
        [
          'scene2d',
          [
            fixture(
              'literal.ts',
              `export function createThing() { return createNode2D(ThingKind, obj, data, runtime); }`,
            ),
          ],
        ],
      ]),
      new Map([['ThingKind', 'Thing']]),
    );
    expect(sites).toHaveLength(1);
    expect(sites[0]).toMatchObject({ chokepoint: 'createNode2D', kind: 'Thing', packageName: 'scene2d' });
  });

  // THE DEFAULT-PARAMETER DEFEATING ARM. `createMesh(geometry, materials, kind: Kind = MeshKind)` forwards a
  // PARAMETER to the chokepoint, so a reader that matches only literal first arguments finds nothing here
  // and reports a population two kinds short with no diagnostic — which is exactly what the first draft of
  // this instrument did to Mesh and Billboard.
  it('resolves a kind forwarded through a parameter default', () => {
    const sites = collectNodeKindChokepointSites(
      new Map([
        [
          'scene3d',
          [
            fixture(
              'defaulted.ts',
              `export function createThing(geometry, materials, kind: Kind = ThingKind, obj) {
                 return createNode3D(kind, obj);
               }`,
            ),
          ],
        ],
      ]),
      new Map([['ThingKind', 'Thing']]),
    );
    expect(sites.map((site) => site.kind)).toEqual(['Thing']);
  });

  // The same site with the default removed must NOT quietly drop out of the census. It resolves to null,
  // which the report turns into an unresolved entry, so the instrument fails instead of shrinking.
  it('yields an unresolvable kind rather than dropping the site when the default is gone', () => {
    const sites = collectNodeKindChokepointSites(
      new Map([
        ['scene3d', [fixture('undefaulted.ts', `export function createThing(kind) { return createNode3D(kind); }`)]],
      ]),
      new Map([['ThingKind', 'Thing']]),
    );
    expect(sites).toHaveLength(1);
    expect(sites[0].kind).toBeNull();
  });

  it('skips a chokepoint forwarding to another chokepoint, which mints no kind of its own', () => {
    const sites = collectNodeKindChokepointSites(
      new Map([
        ['scene2d', [fixture('plumbing.ts', `export function createNode2D(kind) { return createNode(kind); }`)]],
      ]),
      new Map(),
    );
    expect(sites).toEqual([]);
  });

  it('skips a kind-preserving clone, whose kind is its source node and not a new one', () => {
    const sites = collectNodeKindChokepointSites(
      new Map([
        ['scene3d', [fixture('clone.ts', `export function cloneThing(source) { return createNode3D(source.kind); }`)]],
      ]),
      new Map(),
    );
    expect(sites).toEqual([]);
  });
});

describe('collectNodeKindConstants', () => {
  it('reads exported string kind constants', () => {
    const file = fixture('kinds.ts', `export const ThingKind = 'Thing';\nexport const OtherKind = 'Other';`);
    expect(collectNodeKindConstants([file])).toEqual(
      new Map([
        ['ThingKind', 'Thing'],
        ['OtherKind', 'Other'],
      ]),
    );
  });

  it('drops a name bound to two different values rather than guessing one', () => {
    const a = fixture('a.ts', `export const ThingKind = 'Thing';`);
    const b = fixture('b.ts', `export const ThingKind = 'Other';`);
    expect(collectNodeKindConstants([a, b]).has('ThingKind')).toBe(false);
  });
});

describe('collectNodeMintingPackages', () => {
  it('selects only packages whose source calls a chokepoint', () => {
    const minting = fixture('mints.ts', `export function createThing() { return createNode2D(ThingKind); }`);
    const inert = fixture('inert.ts', `export function createThing() { return {}; }`);
    expect(
      collectNodeMintingPackages(
        new Map([
          ['scene2d', [minting]],
          ['color', [inert]],
        ]),
      ),
    ).toEqual(['scene2d']);
  });
});

describe('createNodeKindCensusReport', () => {
  it('classifies a probed node as population and a probed non-node as excluded', () => {
    const report = createNodeKindCensusReport({
      covered: [],
      outcomes: [outcome({ kind: 'Sprite', traits: '2d' }), outcome({ exportName: 'createScene2D' })],
      sites: [],
    });
    expect(report.population).toEqual([
      { evidence: 'runtime-probe', exportName: 'createThing', family: '2d', kind: 'Sprite', packageName: 'scene2d' },
    ]);
    expect(report.excluded).toEqual([{ exportName: 'createScene2D', packageName: 'scene2d', reason: 'not-a-node' }]);
  });

  it('records a node with no kind as caller-supplied rather than as a kind', () => {
    const report = createNodeKindCensusReport({ covered: [], outcomes: [outcome({ traits: '2d' })], sites: [] });
    expect(report.excluded).toEqual([
      { exportName: 'createThing', packageName: 'scene2d', reason: 'kind-supplied-by-caller' },
    ]);
  });

  // A constructor needing a real domain argument is recorded but not fatal, because the static half still
  // establishes its kind. Together the two halves keep the partition total.
  it('keeps a kind whose constructor could not be probed, on static evidence', () => {
    const report = createNodeKindCensusReport({
      covered: [],
      outcomes: [outcome({ exportName: 'createMorphShape', thrown: 'needs a PathMorph' })],
      sites: [site({ enclosingFunction: 'createMorphShape', kind: 'MorphShape' })],
    });
    expect(report.excluded).toEqual([
      { exportName: 'createMorphShape', packageName: 'scene2d', reason: 'probe-threw' },
    ]);
    expect(report.population).toEqual([
      {
        evidence: 'static-chokepoint',
        exportName: 'createMorphShape',
        family: '2d',
        kind: 'MorphShape',
        packageName: 'scene2d',
      },
    ]);
  });

  // THE COVERAGE DEFEATING ARM. A graph kind nothing binds must surface, and must fail the verdict.
  it('reports a kind no registry binds as uncovered and fails the verdict', () => {
    const report = createNodeKindCensusReport({
      covered: ['Sprite'],
      outcomes: [
        outcome({ kind: 'Sprite', traits: '2d' }),
        outcome({ exportName: 'createLater', kind: 'Later', traits: '2d' }),
      ],
      sites: [],
    });
    expect(report.uncovered).toEqual(['Later']);
    expect(hasNodeKindCensusFailure(report)).toBe(true);
  });

  // The opposite direction, which is what would have caught DirectionalLight and Camera3D being written
  // into a roster: a binding for something no public constructor can mint as a node.
  it('reports a binding for a non-node kind as extraneous and fails the verdict', () => {
    const report = createNodeKindCensusReport({
      covered: ['Sprite', 'Camera3D'],
      outcomes: [outcome({ kind: 'Sprite', traits: '2d' })],
      sites: [],
    });
    expect(report.extraneous).toEqual(['Camera3D']);
    expect(hasNodeKindCensusFailure(report)).toBe(true);
  });

  it('reports an unresolvable chokepoint kind rather than a smaller clean population', () => {
    const report = createNodeKindCensusReport({
      covered: [],
      outcomes: [],
      sites: [site({ enclosingFunction: 'buildDocumentNode', kind: null })],
    });
    expect(report.unresolved).toEqual([
      {
        detail: expect.stringContaining('cannot resolve to a constant') as unknown as string,
        exportName: 'buildDocumentNode',
        packageName: 'scene2d',
        reason: 'kind-not-statically-resolvable',
      },
    ]);
    expect(hasNodeKindCensusFailure(report)).toBe(true);
  });

  it('treats a kind minted through the family-agnostic base factory as unresolved, not as a guess', () => {
    const report = createNodeKindCensusReport({
      covered: [],
      outcomes: [],
      sites: [site({ chokepoint: 'createNode', enclosingFunction: 'createThing', kind: 'Thing' })],
    });
    expect(report.population).toEqual([]);
    expect(report.unresolved[0]?.reason).toBe('kind-not-statically-resolvable');
  });
});

describe('formatNodeKindCensusReport', () => {
  it('prints the included, excluded and unresolved populations so the run output is the evidence', () => {
    const text = formatNodeKindCensusReport(
      createNodeKindCensusReport({
        covered: ['Ghost'],
        outcomes: [outcome({ kind: 'Sprite', traits: '2d' }), outcome({ exportName: 'createScene2D' })],
        sites: [site({ enclosingFunction: 'buildDocumentNode', kind: null })],
      }),
    );
    expect(text).toContain('INCLUDED');
    expect(text).toContain('Sprite');
    expect(text).toContain('EXCLUDED');
    expect(text).toContain('not-a-node');
    expect(text).toContain('UNRESOLVED');
    expect(text).toContain('uncovered: Sprite');
    expect(text).toContain('extraneous: Ghost');
  });
});

describe('hasNodeKindCensusFailure', () => {
  it('passes only when nothing is uncovered, extraneous or unresolved', () => {
    expect(
      hasNodeKindCensusFailure(
        createNodeKindCensusReport({
          covered: ['Sprite'],
          outcomes: [outcome({ kind: 'Sprite', traits: '2d' })],
          sites: [],
        }),
      ),
    ).toBe(false);
  });
});

describe('isKindPreservingConstructor', () => {
  it('treats a clone as kind-preserving and a create as kind-introducing', () => {
    expect(isKindPreservingConstructor('cloneSprite')).toBe(true);
    expect(isKindPreservingConstructor('createSprite')).toBe(false);
  });
});

// Each fixture gets its own directory because the Oxc source reader caches by absolute path, so reusing a
// name across tests would serve the first test's text to the second.
function fixture(name: string, source: string): string {
  const file = join(mkdtempSync(join(tmpdir(), 'node-kind-census-')), name);
  writeFileSync(file, source, 'utf-8');
  return file;
}

function outcome(overrides: Readonly<Partial<NodeKindProbeOutcome>> = {}): NodeKindProbeOutcome {
  return { exportName: 'createThing', kind: null, packageName: 'scene2d', thrown: null, traits: null, ...overrides };
}

function site(
  overrides: Readonly<Partial<Parameters<typeof createNodeKindCensusReport>[0]['sites'][number]>> = {},
): Parameters<typeof createNodeKindCensusReport>[0]['sites'][number] {
  return {
    chokepoint: 'createNode2D',
    enclosingFunction: 'createThing',
    kind: null,
    packageName: 'scene2d',
    sourceFile: '/tmp/thing.ts',
    ...overrides,
  };
}
