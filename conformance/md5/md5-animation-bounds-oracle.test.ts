import { importMd5Mesh } from '@flighthq/scene3d-formats/contract';

import {
  classifyMd5AnimationBounds,
  measureMd5AnimationBounds,
  parseMd5DeclaredAnimationBounds,
  runMd5AnimationBoundsOracle,
} from './md5-animation-bounds-oracle';

describe('parseMd5DeclaredAnimationBounds', () => {
  it('reads per-frame boxes and derives each edge precision through the Z-up to Y-up conversion', () => {
    const parsed = parseMd5DeclaredAnimationBounds(
      [
        'MD5Version 10',
        'numFrames 1',
        'numJoints 0',
        'frameRate 20',
        'numAnimatedComponents 0',
        'bounds {',
        '  ( -1.0 -2.00 -3e-2 ) ( 4.000 5 6.0 ) // independently declared',
        '}',
      ].join('\n'),
    );

    expect(parsed).toEqual({
      bounds: [
        {
          max: { x: 4, y: 6, z: 2 },
          min: { x: -1, y: -0.03, z: -5 },
          precision: {
            max: { x: 0.0005, y: 0.05, z: 0.005 },
            min: { x: 0.05, y: 0.005, z: 0.5 },
          },
        },
      ],
      frameRate: 20,
    });
  });

  it('rejects bounds that do not reconcile with declarations and block structure', () => {
    expect(parseMd5DeclaredAnimationBounds('numFrames 2\nframeRate 24\nbounds {\n(0 0 0) (1 1 1)\n}')).toBeNull();
    expect(
      parseMd5DeclaredAnimationBounds(
        'numFrames 1\nframeRate 24\nbounds {\n(0 0 0) (1 1 1)\n}\nbounds {\n(0 0 0) (1 1 1)\n}',
      ),
    ).toBeNull();
    expect(parseMd5DeclaredAnimationBounds('numFrames 1\nframeRate 24\nbounds {\n(2 0 0) (1 1 1)\n}')).toBeNull();
  });
});

describe('MD5 animation bounds measurement', () => {
  const declared = {
    max: { x: 10, y: 10, z: 10 },
    min: { x: 0, y: 0, z: 0 },
  };
  const precision = {
    max: { x: 0.01, y: 0.01, z: 0.01 },
    min: { x: 0.01, y: 0.01, z: 0.01 },
  };

  it('keeps exact, contained, precision-sized excursions, and real exceedance distinct', () => {
    const exact = measureMd5AnimationBounds(declared, declared);
    const contained = measureMd5AnimationBounds(declared, {
      max: { x: 9.5, y: 9, z: 8 },
      min: { x: 0.5, y: 1, z: 2 },
    });
    const withinPrecision = measureMd5AnimationBounds(declared, {
      max: { x: 10.005, y: 10, z: 10 },
      min: { x: -0.005, y: 0, z: 0 },
    });
    const exceeds = measureMd5AnimationBounds(declared, {
      max: { x: 10.02, y: 10, z: 10 },
      min: { x: 0, y: 0, z: 0 },
    });

    expect(classifyMd5AnimationBounds(exact, precision)).toBe('exact');
    expect(classifyMd5AnimationBounds(contained, precision)).toBe('contained');
    expect(classifyMd5AnimationBounds(withinPrecision, precision)).toBe('within-representable-precision');
    expect(classifyMd5AnimationBounds(exceeds, precision)).toBe('exceeds-representable-precision');
    expect(withinPrecision).toEqual({
      max: { x: 0.005000000000000782, y: 0, z: 0 },
      min: { x: 0.005, y: 0, z: 0 },
    });
  });
});

describe('runMd5AnimationBoundsOracle', () => {
  it('applies the imported clip and measures the exact union of its skinned mesh vertices', () => {
    const animation = animationSource('( 1.000 0.000 0.000 ) ( 2.000 1.000 0.000 )');
    const oracle = runMd5AnimationBoundsOracle(importMd5Mesh(MESH_SOURCE, animation), animation);

    expect(oracle).toMatchObject({
      notRunReason: 'declared-bounds-contract-unresolved',
      state: 'not-run',
    });
    if (!('frames' in oracle)) throw new Error('expected measured oracle evidence');
    expect(oracle.frames).toHaveLength(1);
    expect(oracle.frames[0]).toMatchObject({
      classification: 'exact',
      deltas: { max: { x: 0, y: 0, z: 0 }, min: { x: 0, y: 0, z: 0 } },
      frame: 0,
      observed: { max: { x: 2, y: 0, z: 0 }, min: { x: 1, y: 0, z: -1 } },
    });
  });

  it('reports a runtime excursion beyond the source-derived precision as first-class evidence', () => {
    const animation = animationSource('( 1.000 0.000 0.000 ) ( 1.900 1.000 0.000 )');
    const oracle = runMd5AnimationBoundsOracle(importMd5Mesh(MESH_SOURCE, animation), animation);

    expect(oracle).toMatchObject({
      notRunReason: 'declared-bounds-contract-unresolved',
      state: 'not-run',
    });
    if (!('frames' in oracle)) throw new Error('expected measured oracle evidence');
    expect(oracle.frames[0]).toMatchObject({
      classification: 'exceeds-representable-precision',
      deltas: { max: { x: 0.10000000000000009 } },
    });
  });

  it('does not turn unreadable oracle input or a missing clip into a clean result', () => {
    const scene = importMd5Mesh(MESH_SOURCE);
    expect(runMd5AnimationBoundsOracle(scene, 'not md5')).toEqual({
      id: 'md5.animation-bounds',
      notRunReason: 'declared-bounds-unreadable',
      state: 'not-run',
    });
    expect(runMd5AnimationBoundsOracle(scene, animationSource('( 0 0 0 ) ( 1 1 1 )'))).toEqual({
      id: 'md5.animation-bounds',
      notRunReason: 'animation-clip-missing',
      state: 'not-run',
    });
  });
});

function animationSource(bounds: string): string {
  return [
    'MD5Version 10',
    'numFrames 1',
    'numJoints 1',
    'frameRate 24',
    'numAnimatedComponents 3',
    'hierarchy {',
    '  "root" -1 7 0',
    '}',
    'bounds {',
    `  ${bounds}`,
    '}',
    'baseframe {',
    '  ( 0 0 0 ) ( 0 0 0 )',
    '}',
    'frame 0 {',
    '  1 0 0',
    '}',
  ].join('\n');
}

const MESH_SOURCE = [
  'MD5Version 10',
  'numJoints 1',
  'numMeshes 1',
  'joints {',
  '  "root" -1 ( 0 0 0 ) ( 0 0 0 )',
  '}',
  'mesh {',
  '  shader "textures/example"',
  '  numverts 3',
  '  vert 0 ( 0 0 ) 0 1',
  '  vert 1 ( 1 0 ) 1 1',
  '  vert 2 ( 0 1 ) 2 1',
  '  numtris 1',
  '  tri 0 0 1 2',
  '  numweights 3',
  '  weight 0 0 1 ( 0 0 0 )',
  '  weight 1 0 1 ( 1 0 0 )',
  '  weight 2 0 1 ( 0 1 0 )',
  '}',
].join('\n');
