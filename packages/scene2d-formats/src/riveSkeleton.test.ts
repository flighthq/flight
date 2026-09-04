import { RAD_TO_DEG } from '@flighthq/math/contract';
import type { RiveArtboardGraph, RiveCoreObject } from '@flighthq/types/contract';
import { RiveFieldType } from '@flighthq/types/contract';

import { createRiveSkeleton2D, initializeRiveSkeleton2DImport } from './riveSkeleton';

// Rive keeps bones in the artboard's component tree as TransformComponents, while Skeleton2D needs a
// flat parent-before-child array. Bone(40) and RootBone(41) are the two concrete types; a RootBone
// states its own x/y (keys 90/91) while every other bone sits at its parent's tip.

const ARTBOARD = 1;
const NODE = 2;
const BONE = 40;
const ROOT_BONE = 41;

const NAME = 4;
const ROTATION = 15;
const SCALE_X = 16;
const SCALE_Y = 17;
const LENGTH = 89;
const ROOT_X = 90;
const ROOT_Y = 91;

describe('createRiveSkeleton2D', () => {
  it('returns null for an artboard with no bones', () => {
    expect(createRiveSkeleton2D(artboard([object(ARTBOARD, {}), object(NODE, {})], [-1, 0]))).toBeNull();
  });

  it('orders every bone after its parent even when the stream states the child first', () => {
    // The child bone precedes its parent in the stream, which is exactly what the sort exists for:
    // Skeleton2D propagates world transforms in one linear pass and requires parent-before-child.
    const result = createRiveSkeleton2D(
      artboard(
        [object(ARTBOARD, {}), object(BONE, {}, 'tip'), object(ROOT_BONE, {}, 'root')],
        // component 1 (tip) is parented to component 2 (root)
        [-1, 2, 0],
      ),
    );

    expect(result!.skeleton.bones.map((bone) => bone.name)).toEqual(['root', 'tip']);
    expect(result!.skeleton.bones[1].parentIndex).toBe(0);
    expect(result!.skeleton.bones[0].parentIndex).toBe(-1);
  });

  it('maps each artboard component index to its bone index, and to -1 for everything else', () => {
    const result = createRiveSkeleton2D(
      artboard([object(ARTBOARD, {}), object(NODE, {}), object(ROOT_BONE, {}, 'root')], [-1, 0, 0]),
    );

    // Animation keys objects by component index, so this is what a channel needs to reach its bone.
    expect(result!.boneIndices[2]).toBe(0);
    expect(result!.boneIndices[1]).toBe(-1);
    expect(result!.boneIndices[0]).toBe(-1);
  });

  it('places a root bone at the position it states', () => {
    const result = createRiveSkeleton2D(
      artboard([object(ARTBOARD, {}), object(ROOT_BONE, { [ROOT_X]: 12, [ROOT_Y]: -5 }, 'root')], [-1, 0]),
    );

    expect(result!.skeleton.bones[0].x).toBe(12);
    expect(result!.skeleton.bones[0].y).toBe(-5);
  });

  it('places a child bone at its parent tip rather than at the origin', () => {
    // A non-root bone states no x/y of its own — the format derives it from the parent's length. A
    // reader that looked for x/y here would find nothing and collapse the whole chain onto the root.
    const result = createRiveSkeleton2D(
      artboard(
        [object(ARTBOARD, {}), object(ROOT_BONE, { [LENGTH]: 40 }, 'root'), object(BONE, { [LENGTH]: 25 }, 'child')],
        [-1, 0, 1],
      ),
    );

    expect(result!.skeleton.bones[1].x).toBe(40);
    expect(result!.skeleton.bones[1].y).toBe(0);
    expect(result!.skeleton.bones[1].length).toBe(25);
  });

  it('converts bone rotation from radians to degrees', () => {
    const result = createRiveSkeleton2D(
      artboard([object(ARTBOARD, {}), object(ROOT_BONE, { [ROTATION]: Math.PI / 2 }, 'root')], [-1, 0]),
    );

    expect(result!.skeleton.bones[0].rotation).toBeCloseTo(90, 6);
    expect(result!.skeleton.bones[0].rotation).toBeCloseTo((Math.PI / 2) * RAD_TO_DEG, 10);
  });

  it('defaults an unstated scale to 1 rather than 0', () => {
    const result = createRiveSkeleton2D(
      artboard([object(ARTBOARD, {}), object(ROOT_BONE, { [SCALE_X]: 2 }, 'root')], [-1, 0]),
    );

    expect(result!.skeleton.bones[0].scaleX).toBe(2);
    expect(result!.skeleton.bones[0].scaleY).toBe(1);
  });

  it('sizes the skeleton transform buffers to the bone count', () => {
    const result = createRiveSkeleton2D(
      artboard(
        [object(ARTBOARD, {}), object(ROOT_BONE, {}, 'root'), object(BONE, {}, 'a'), object(BONE, {}, 'b')],
        [-1, 0, 1, 2],
      ),
    );

    // Six floats per bone: the flat 2x3 affine blocks the deformer and attachment layers consume.
    expect(result!.skeleton.bones).toHaveLength(3);
    expect(result!.skeleton.worldMatrices).toHaveLength(18);
    expect(result!.skeleton.boneMatrices).toHaveLength(18);
  });

  it('keeps a deep chain in parent-before-child order', () => {
    const result = createRiveSkeleton2D(
      artboard(
        [
          object(ARTBOARD, {}),
          object(BONE, {}, 'c'),
          object(BONE, {}, 'b'),
          object(ROOT_BONE, {}, 'a'),
          object(BONE, {}, 'd'),
        ],
        // a(3) -> b(2) -> c(1) -> d(4), stated in scrambled stream order
        [-1, 2, 3, 0, 1],
      ),
    );

    expect(result!.skeleton.bones.map((bone) => bone.name)).toEqual(['a', 'b', 'c', 'd']);
    for (const [index, bone] of result!.skeleton.bones.entries()) {
      expect(bone.parentIndex).toBeLessThan(index);
    }
  });
});

function artboard(objects: RiveCoreObject[], parents: number[]): RiveArtboardGraph {
  return { objects, parentIndices: parents, streamEnd: objects.length, streamStart: 0 };
}

function object(typeKey: number, properties: Readonly<Record<number, number>>, name?: string): RiveCoreObject {
  const entries: RiveCoreObject['properties'] = Object.entries(properties).map(([key, value]) => ({
    key: Number(key),
    type: RiveFieldType.Double,
    value,
  }));
  if (name !== undefined) entries.push({ key: NAME, type: RiveFieldType.String, value: name });
  return { properties: entries, typeKey };
}
describe('initializeRiveSkeleton2DImport', () => {
  it('is the construction initializer of createRiveSkeleton2DImport', () => {
    expect(typeof initializeRiveSkeleton2DImport).toBe('function');
  });
});
