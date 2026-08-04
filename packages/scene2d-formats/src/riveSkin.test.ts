import type { ImportDiagnostic, RiveArtboardGraph, RiveCoreObject, RiveWeightedPoint } from '@flighthq/types/contract';
import { RiveFieldType, RiveWeightedPointKind } from '@flighthq/types/contract';

import { createRiveSkin2D } from './riveSkin';

// Rive packs FOUR influences into one uint apiece — a weight byte 0-255 and a tendon byte — read low
// byte first. A weight index names a TENDON, not a bone, and numbering starts at 1 because the
// runtime reserves slot 0 for the identity. A tendon states its BIND, which is inverted to put the
// point into bone space.

const POINTS_PATH = 16;
const STRAIGHT_VERTEX = 5;
const CUBIC_DETACHED_VERTEX = 6;
const SKIN = 43;
const TENDON = 44;
const WEIGHT = 45;
const CUBIC_WEIGHT = 46;

const PARENT_ID = 5;
const BONE_ID = 95;
const TENDON_TX = 100;
const TENDON_TY = 101;
const VALUES = 102;
const INDICES = 103;
const SKIN_TX = 108;
const SKIN_TY = 109;
const IN_VALUES = 110;
const IN_INDICES = 111;
const OUT_VALUES = 112;
const OUT_INDICES = 113;

describe('createRiveSkin2D', () => {
  it('returns null for a path that carries no skin', () => {
    const artboard = graph([object(POINTS_PATH, {})], [-1]);

    expect(createRiveSkin2D(artboard, 0, [0], [point(0, 0, 0)])).toBeNull();
  });

  it('unpacks four influences from one word, low byte first', () => {
    // Two tendons, weights 128 and 127 in the low two bytes, indices 1 and 2.
    const result = createRiveSkin2D(...skinnedPath({ [VALUES]: 0x7f80, [INDICES]: 0x0201 }));

    expect(result!.influenceCounts[0]).toBe(2);
    expect(result!.influences[0]).toBe(0);
    expect(result!.influences[3]).toBeCloseTo(128 / 255, 6);
    expect(result!.influences[4]).toBe(1);
    expect(result!.influences[7]).toBeCloseTo(127 / 255, 6);
  });

  it('treats a zero weight as an unused slot rather than a real influence', () => {
    // A fixed-width record is what produces Skin2D's VARIABLE influence counts.
    const result = createRiveSkin2D(...skinnedPath({ [VALUES]: 0x00ff, [INDICES]: 0x0201 }));

    expect(result!.influenceCounts[0]).toBe(1);
    expect(result!.influences).toHaveLength(4);
  });

  it('reads the index as a tendon number starting at 1, not as a bone index', () => {
    // Tendon 2 names bone component 4, which the flatten placed at bone index 1. Reading the stored
    // 2 as a bone index directly would address the wrong bone in every file with more than one.
    const result = createRiveSkin2D(...skinnedPath({ [VALUES]: 0x00ff, [INDICES]: 0x0002 }));

    expect(result!.influences[0]).toBe(1);
  });

  it('puts the offset into bone space by inverting the tendon bind', () => {
    // Skin translates by (100, 0) and the tendon binds at (30, 0), so a vertex authored at (5, 0)
    // sits at 105 in bind space and 75 in that bone's space.
    const result = createRiveSkin2D(...skinnedPath({ [VALUES]: 0x00ff, [INDICES]: 0x0001 }, { x: 5, y: 0 }));

    expect(result!.influences[1]).toBeCloseTo(75, 5);
    expect(result!.influences[2]).toBeCloseTo(0, 5);
  });

  it('gives a cubic handle the influences it states rather than its anchor own', () => {
    // This is the whole point: CubicWeight adds in/out pairs, so a handle is separately weighted.
    // Inheriting the anchor's would discard authored data on every cubic vertex in a rigged file.
    const artboard = cubicSkinnedPath();
    const points: RiveWeightedPoint[] = [
      { kind: RiveWeightedPointKind.Point, vertex: 4, x: 0, y: 0 },
      { kind: RiveWeightedPointKind.In, vertex: 4, x: 0, y: 0 },
      { kind: RiveWeightedPointKind.Out, vertex: 4, x: 0, y: 0 },
    ];
    // Bone components 3 and 4 flattened to bone indices 0 and 1, as in the straight-vertex helper.
    const result = createRiveSkin2D(artboard, 0, [-1, -1, -1, 0, 1, -1], points);

    // anchor -> tendon 1 (bone 0), in -> tendon 2 (bone 1), out -> tendon 1 again at half weight.
    expect(Array.from(result!.influenceCounts)).toEqual([1, 1, 1]);
    expect(result!.influences[0]).toBe(0);
    expect(result!.influences[4]).toBe(1);
    expect(result!.influences[11]).toBeCloseTo(128 / 255, 6);
  });

  it('gives a plain weight no handle influences rather than reusing its anchor pair', () => {
    const artboard = skinnedPath({ [VALUES]: 0x00ff, [INDICES]: 0x0001 })[0];
    const result = createRiveSkin2D(
      artboard,
      0,
      [-1, -1, -1, 0, 1, -1],
      [{ kind: RiveWeightedPointKind.In, vertex: 4, x: 0, y: 0 }],
    );

    expect(result!.influenceCounts[0]).toBe(0);
    expect(result!.influences).toHaveLength(0);
  });

  it('reports an influence naming the identity slot instead of dropping it silently', () => {
    // Index 0 is the runtime's identity, not a tendon, so it names no bone. Dropping it quietly
    // would leave the vertex under-weighted and simply in the wrong place.
    const diagnostics: ImportDiagnostic[] = [];
    const [artboard, skinnable, bones, points] = skinnedPath({ [VALUES]: 0x00ff, [INDICES]: 0x0000 });
    const result = createRiveSkin2D(artboard, skinnable, bones, points, diagnostics);

    expect(result!.influenceCounts[0]).toBe(0);
    expect(diagnostics.map((entry) => entry.kind)).toEqual(['rive.unresolved-weight-bone']);
  });

  it('reports an influence naming a tendon the skin does not have', () => {
    const diagnostics: ImportDiagnostic[] = [];
    const [artboard, skinnable, bones, points] = skinnedPath({ [VALUES]: 0x00ff, [INDICES]: 0x0009 });
    createRiveSkin2D(artboard, skinnable, bones, points, diagnostics);

    expect(diagnostics.map((entry) => entry.kind)).toEqual(['rive.unresolved-weight-bone']);
  });
});

// A path with a skin carrying two tendons, and one straight vertex whose weight the caller supplies.
// Components: 0 path, 1 skin, 2 tendon->bone component 3, 3 tendon->bone component 4, 4 vertex, 5 weight.
function skinnedPath(
  weight: Readonly<Record<number, number>>,
  at: Readonly<{ x: number; y: number }> = { x: 0, y: 0 },
): [RiveArtboardGraph, number, number[], RiveWeightedPoint[]] {
  const artboard = graph(
    [
      object(POINTS_PATH, {}),
      object(SKIN, { [SKIN_TX]: 100, [SKIN_TY]: 0 }),
      object(TENDON, { [BONE_ID]: 3, [TENDON_TX]: 30, [TENDON_TY]: 0 }),
      object(TENDON, { [BONE_ID]: 4, [TENDON_TX]: 0, [TENDON_TY]: 0 }),
      object(STRAIGHT_VERTEX, {}),
      object(WEIGHT, weight),
    ],
    [-1, 0, 1, 1, 0, 4],
  );
  // Bone components 3 and 4 flattened to bone indices 0 and 1.
  const boneIndices = [-1, -1, -1, 0, 1, -1];
  return [artboard, 0, boneIndices, [point(4, at.x, at.y)]];
}

// The same shape but with a cubic vertex whose CubicWeight states its own in/out pairs.
function cubicSkinnedPath(): RiveArtboardGraph {
  return graph(
    [
      object(POINTS_PATH, {}),
      object(SKIN, {}),
      object(TENDON, { [BONE_ID]: 3 }),
      object(TENDON, { [BONE_ID]: 4 }),
      object(CUBIC_DETACHED_VERTEX, {}),
      object(CUBIC_WEIGHT, {
        [VALUES]: 0x00ff,
        [INDICES]: 0x0001,
        [IN_VALUES]: 0x00ff,
        [IN_INDICES]: 0x0002,
        [OUT_VALUES]: 0x0080,
        [OUT_INDICES]: 0x0001,
      }),
    ],
    [-1, 0, 1, 1, 0, 4],
  );
}

function point(vertex: number, x: number, y: number): RiveWeightedPoint {
  return { kind: RiveWeightedPointKind.Point, vertex, x, y };
}

function graph(objects: RiveCoreObject[], parents: number[]): RiveArtboardGraph {
  return { objects, parentIndices: parents, streamEnd: objects.length, streamStart: 0 };
}

function object(typeKey: number, properties: Readonly<Record<number, number>>): RiveCoreObject {
  return {
    properties: Object.entries(properties).map(([key, value]) => ({
      key: Number(key),
      type: RiveFieldType.Double,
      value,
    })),
    typeKey,
  };
}
