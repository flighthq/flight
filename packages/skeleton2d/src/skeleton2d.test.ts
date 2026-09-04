import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { createMatrix } from '@flighthq/geometry/contract';
import type { Bone2D, RegionAttachment2D, Slot2D } from '@flighthq/types/contract';
import { RegionAttachment2DKind, TransformMode2D } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import {
  cloneSkeleton2D,
  computeSkeleton2DBoneMatrices,
  computeSkeleton2DBoneWorldTransform,
  computeSkeleton2DWorldTransforms,
  createSkeleton2D,
  disposeSkeleton2D,
  equalsSkeleton2D,
  getSkeleton2DBoneIndexByName,
  getSkeleton2DBoneWorldMatrix,
  getSkeleton2DSkin,
  setSkeleton2DBindPose,
  setSkeleton2DSkin,
  validateSkeleton2D,
} from './skeleton2d';

function makeBone(overrides: Partial<Bone2D> = {}): Bone2D {
  return {
    length: 0,
    name: null,
    parentIndex: -1,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    shearX: 0,
    shearY: 0,
    transformMode: TransformMode2D.Normal,
    x: 0,
    y: 0,
    ...overrides,
  };
}

describe('cloneSkeleton2D', () => {
  it('deep-copies bones so the clone poses independently', () => {
    const s = createSkeleton2D([makeBone({ name: 'root', rotation: 30 })]);
    const c = cloneSkeleton2D(s);
    c.bones[0].rotation = 90;
    expect(s.bones[0].rotation).toBe(30);
    expect(c.bones[0].rotation).toBe(90);
    // Buffers are distinct instances.
    expect(c.worldMatrices).not.toBe(s.worldMatrices);
  });

  it('includes skins so getSkeleton2DSkin works on the clone', () => {
    const s = createSkeleton2D([makeBone({ name: 'root' })], [testSlot('head', 0)]);
    s.skins = [{ attachments: [{ attachment: testRegion('hat'), name: 'head', slotIndex: 0 }], name: 'goblin' }];
    const c = cloneSkeleton2D(s);
    expect(getSkeleton2DSkin(c, 'goblin')).not.toBeNull();
    expect(getSkeleton2DSkin(c, 'goblin')!.name).toBe('goblin');
    expect(c.skins).toBe(s.skins);
  });
});

describe('computeSkeleton2DBoneMatrices', () => {
  it('yields identity palettes at the captured bind pose and non-identity once posed', () => {
    const s = createSkeleton2D([makeBone({ x: 10, rotation: 45 }), makeBone({ parentIndex: 0, x: 5 })]);
    computeSkeleton2DWorldTransforms(s);
    setSkeleton2DBindPose(s);
    computeSkeleton2DBoneMatrices(s);
    // At bind pose, palette = world × inverse(world) = identity for every bone.
    for (let i = 0; i < s.bones.length; i++) {
      const o = i * 6;
      expect(s.boneMatrices[o]).toBeCloseTo(1, 4);
      expect(s.boneMatrices[o + 1]).toBeCloseTo(0, 4);
      expect(s.boneMatrices[o + 2]).toBeCloseTo(0, 4);
      expect(s.boneMatrices[o + 3]).toBeCloseTo(1, 4);
      expect(s.boneMatrices[o + 4]).toBeCloseTo(0, 4);
      expect(s.boneMatrices[o + 5]).toBeCloseTo(0, 4);
    }
    // Repose the root; the palette leaves identity.
    s.bones[0].rotation = 90;
    computeSkeleton2DWorldTransforms(s);
    computeSkeleton2DBoneMatrices(s);
    const changed = Math.abs(s.boneMatrices[0] - 1) > 1e-3 || Math.abs(s.boneMatrices[1]) > 1e-3;
    expect(changed).toBe(true);
  });
});

describe('computeSkeleton2DBoneWorldTransform', () => {
  it('refreshes one bone from its already-current parent, leaving its siblings and descendants stale', () => {
    const skeleton = createSkeleton2D([
      makeBone(),
      makeBone({ parentIndex: 0, x: 10 }),
      makeBone({ parentIndex: 1, x: 10 }),
    ]);
    computeSkeleton2DWorldTransforms(skeleton);

    // A constraint solver's move: write one bone's local rotation, refresh only that bone.
    skeleton.bones[1].rotation = 90;
    computeSkeleton2DBoneWorldTransform(skeleton, 1);

    // Bone 1's own basis turned...
    expect(skeleton.worldMatrices[1 * 6]).toBeCloseTo(0, 5);
    expect(skeleton.worldMatrices[1 * 6 + 1]).toBeCloseTo(1, 5);
    // ...and its child is deliberately untouched until the caller re-runs the whole pass.
    expect(skeleton.worldMatrices[2 * 6 + 4]).toBeCloseTo(20, 5);

    computeSkeleton2DWorldTransforms(skeleton);
    expect(skeleton.worldMatrices[2 * 6 + 4]).toBeCloseTo(10, 5);
    expect(skeleton.worldMatrices[2 * 6 + 5]).toBeCloseTo(10, 5);
  });

  it('ignores a bone index outside the array rather than writing past the buffer', () => {
    const skeleton = createSkeleton2D([makeBone()]);
    computeSkeleton2DWorldTransforms(skeleton);

    expect(() => computeSkeleton2DBoneWorldTransform(skeleton, 7)).not.toThrow();
    expect(() => computeSkeleton2DBoneWorldTransform(skeleton, -1)).not.toThrow();
  });
});

describe('computeSkeleton2DWorldTransforms', () => {
  it('rotates a root 90° into an (a=0,b=1,c=-1,d=0) world matrix at its translation', () => {
    const s = createSkeleton2D([makeBone({ x: 10, y: 0, rotation: 90 })]);
    computeSkeleton2DWorldTransforms(s);
    expect(s.worldMatrices[0]).toBeCloseTo(0, 5); // a
    expect(s.worldMatrices[1]).toBeCloseTo(1, 5); // b
    expect(s.worldMatrices[2]).toBeCloseTo(-1, 5); // c
    expect(s.worldMatrices[3]).toBeCloseTo(0, 5); // d
    expect(s.worldMatrices[4]).toBeCloseTo(10, 5); // tx
    expect(s.worldMatrices[5]).toBeCloseTo(0, 5); // ty
  });

  it('places a child at parent × local (2 units along a 90°-rotated parent maps to +y)', () => {
    const s = createSkeleton2D([makeBone({ x: 10, y: 0, rotation: 90 }), makeBone({ parentIndex: 0, x: 2, y: 0 })]);
    computeSkeleton2DWorldTransforms(s);
    const out = createMatrix();
    getSkeleton2DBoneWorldMatrix(out, s, 1);
    expect(out.tx).toBeCloseTo(10, 5);
    expect(out.ty).toBeCloseTo(2, 5);
  });

  it('OnlyTranslation inherits the parent position but not its rotation', () => {
    const s = createSkeleton2D([
      makeBone({ rotation: 90 }),
      makeBone({ parentIndex: 0, x: 3, y: 0, transformMode: TransformMode2D.OnlyTranslation }),
    ]);
    computeSkeleton2DWorldTransforms(s);
    const out = createMatrix();
    getSkeleton2DBoneWorldMatrix(out, s, 1);
    // Linear part is the child's own (identity), not the parent's 90° rotation.
    expect(out.a).toBeCloseTo(1, 5);
    expect(out.b).toBeCloseTo(0, 5);
    expect(out.c).toBeCloseTo(0, 5);
    expect(out.d).toBeCloseTo(1, 5);
    // Position still follows the parent (3 along parent +x → +y in world).
    expect(out.tx).toBeCloseTo(0, 5);
    expect(out.ty).toBeCloseTo(3, 5);
  });

  it('NoScale strips the parent scale but keeps its rotation', () => {
    const s = createSkeleton2D([
      makeBone({ scaleX: 3, scaleY: 3 }),
      makeBone({ parentIndex: 0, transformMode: TransformMode2D.NoScale }),
    ]);
    computeSkeleton2DWorldTransforms(s);
    const out = createMatrix();
    getSkeleton2DBoneWorldMatrix(out, s, 1);
    // Parent's 3× scale removed → the child's world linear part is unit (identity here, no rotation).
    expect(out.a).toBeCloseTo(1, 5);
    expect(out.b).toBeCloseTo(0, 5);
    expect(out.c).toBeCloseTo(0, 5);
    expect(out.d).toBeCloseTo(1, 5);
  });

  it('NoRotationOrReflection keeps the parent scale but strips its rotation', () => {
    const s = createSkeleton2D([
      makeBone({ rotation: 90, scaleX: 2, scaleY: 2 }),
      makeBone({ parentIndex: 0, transformMode: TransformMode2D.NoRotationOrReflection }),
    ]);
    computeSkeleton2DWorldTransforms(s);
    const out = createMatrix();
    getSkeleton2DBoneWorldMatrix(out, s, 1);
    // Parent's 90° rotation removed, its 2× scale kept → axis-aligned 2× world.
    expect(out.a).toBeCloseTo(2, 5);
    expect(out.b).toBeCloseTo(0, 5);
    expect(out.c).toBeCloseTo(0, 5);
    expect(out.d).toBeCloseTo(2, 5);
  });

  it('NoScaleOrReflection never flips the child under a reflected parent', () => {
    const s = createSkeleton2D([
      makeBone({ scaleX: -2, scaleY: 2 }), // reflected (negative X scale)
      makeBone({ parentIndex: 0, transformMode: TransformMode2D.NoScaleOrReflection }),
    ]);
    computeSkeleton2DWorldTransforms(s);
    const out = createMatrix();
    getSkeleton2DBoneWorldMatrix(out, s, 1);
    // Determinant stays positive (no reflection) and unit magnitude (no scale).
    const det = out.a * out.d - out.c * out.b;
    expect(det).toBeCloseTo(1, 5);
  });

  // FORMULA parity — expected world matrices computed BY HAND from Spine's published bone-transform
  // formulas (updateWorldTransform per transformMode), NOT from a real rig corpus. These use an ASYMMETRIC
  // parent (rotation 90°, scaleX 2, scaleY 1 → world column-lengths psx=2, psy=1) so a bug that confused
  // the two column scales, or that skipped the parent×local compose, would surface — cases the symmetric
  // fixtures above cannot catch. Corpus parity against Spine's own runtime output requires an approved
  // external rig AND oracle (see skeleton2d-formats charter); this proves formula match only.
  it('FORMULA parity: Normal composes parent × local (asymmetric 90°/2×1 parent + a 90° child)', () => {
    // Parent world = [a,b,c,d] = [cos90·2, sin90·2, cos180·1, sin180·1] = [0, 2, -1, 0].
    // Child local (rot 90°, unit scale) = [0, 1, -1, 0]. Normal: world = parentMatrix × localMatrix:
    //   a=pa·la+pc·lb=0·0+(-1)·1=-1  b=pb·la+pd·lb=2·0+0·1=0
    //   c=pa·lc+pc·ld=0·(-1)+(-1)·0=0  d=pb·lc+pd·ld=2·(-1)+0·0=-2  → [-1, 0, 0, -2] (det 2 = parent det × child det).
    const s = createSkeleton2D([
      makeBone({ rotation: 90, scaleX: 2, scaleY: 1 }),
      makeBone({ parentIndex: 0, rotation: 90 }),
    ]);
    computeSkeleton2DWorldTransforms(s);
    const out = createMatrix();
    getSkeleton2DBoneWorldMatrix(out, s, 1);
    expect(out.a).toBeCloseTo(-1, 5);
    expect(out.b).toBeCloseTo(0, 5);
    expect(out.c).toBeCloseTo(0, 5);
    expect(out.d).toBeCloseTo(-2, 5);
  });

  it('FORMULA parity: NoRotationOrReflection keeps per-axis parent scale (2,1), strips rotation', () => {
    // Parent world [0,2,-1,0] → psx=hypot(0,2)=2, psy=hypot(-1,0)=1. Identity child, axis-aligned scale-only
    // parent: a=psx·la=2·1=2, b=psy·lb=1·0=0, c=psx·lc=2·0=0, d=psy·ld=1·1=1 → [2, 0, 0, 1]. Asymmetric a≠d
    // is the point: a uniform-scale parent would hide a psx/psy mix-up.
    const s = createSkeleton2D([
      makeBone({ rotation: 90, scaleX: 2, scaleY: 1 }),
      makeBone({ parentIndex: 0, transformMode: TransformMode2D.NoRotationOrReflection }),
    ]);
    computeSkeleton2DWorldTransforms(s);
    const out = createMatrix();
    getSkeleton2DBoneWorldMatrix(out, s, 1);
    expect(out.a).toBeCloseTo(2, 5);
    expect(out.b).toBeCloseTo(0, 5);
    expect(out.c).toBeCloseTo(0, 5);
    expect(out.d).toBeCloseTo(1, 5);
  });

  it('FORMULA parity: NoScale keeps the parent rotation but strips its (2,1) scale to unit', () => {
    // Parent world [0,2,-1,0], normalized columns: nax=0/2=0, nay=2/2=1, ncx=-1/1=-1, ncy=0/1=0. Identity
    // child: a=nax·la+ncx·lb=0, b=nay·la+ncy·lb=1, c=nax·lc+ncx·ld=-1, d=nay·lc+ncy·ld=0 → [0,1,-1,0]:
    // a pure 90° rotation (det +1), the parent's orientation with the scale removed.
    const s = createSkeleton2D([
      makeBone({ rotation: 90, scaleX: 2, scaleY: 1 }),
      makeBone({ parentIndex: 0, transformMode: TransformMode2D.NoScale }),
    ]);
    computeSkeleton2DWorldTransforms(s);
    const out = createMatrix();
    getSkeleton2DBoneWorldMatrix(out, s, 1);
    expect(out.a).toBeCloseTo(0, 5);
    expect(out.b).toBeCloseTo(1, 5);
    expect(out.c).toBeCloseTo(-1, 5);
    expect(out.d).toBeCloseTo(0, 5);
  });

  it('FORMULA parity: NoScale vs NoScaleOrReflection differ on a reflected parent (keep vs strip the flip)', () => {
    // Reflected parent (scaleY -1) world = [1, 0, 0, -1] (det -1). Identity children. NoScale keeps the
    // parent reflection → [1,0,0,-1] (det -1); NoScaleOrReflection forces y-axis = +90° of x-axis → [1,0,0,1]
    // (det +1). This side-by-side contrast is the exact semantic boundary between the two modes.
    const s = createSkeleton2D([
      makeBone({ scaleX: 1, scaleY: -1 }),
      makeBone({ parentIndex: 0, transformMode: TransformMode2D.NoScale }),
      makeBone({ parentIndex: 0, transformMode: TransformMode2D.NoScaleOrReflection }),
    ]);
    computeSkeleton2DWorldTransforms(s);
    const kept = createMatrix();
    getSkeleton2DBoneWorldMatrix(kept, s, 1);
    expect(kept.a).toBeCloseTo(1, 5);
    expect(kept.d).toBeCloseTo(-1, 5);
    expect(kept.a * kept.d - kept.c * kept.b).toBeCloseTo(-1, 5); // reflection kept
    const stripped = createMatrix();
    getSkeleton2DBoneWorldMatrix(stripped, s, 2);
    expect(stripped.a).toBeCloseTo(1, 5);
    expect(stripped.d).toBeCloseTo(1, 5);
    expect(stripped.a * stripped.d - stripped.c * stripped.b).toBeCloseTo(1, 5); // reflection stripped
  });

  it('FORMULA parity: a root bone applies shearX as an offset to the x-axis angle', () => {
    // Local formula: a=cos(rot+shearX)·scaleX, b=sin(rot+shearX)·scaleX. With rot 0, shearX 45°, unit scale:
    // x-axis is at 45° (a=b=cos45=√2/2) while the y-axis stays at rot+90°=90° (c=0,d=1) — non-orthogonal
    // axes, the defining signature of shear.
    const s = createSkeleton2D([makeBone({ shearX: 45 })]);
    computeSkeleton2DWorldTransforms(s);
    const root2 = Math.SQRT1_2; // cos45 = sin45 = √2/2
    expect(s.worldMatrices[0]).toBeCloseTo(root2, 5); // a
    expect(s.worldMatrices[1]).toBeCloseTo(root2, 5); // b
    expect(s.worldMatrices[2]).toBeCloseTo(0, 5); // c
    expect(s.worldMatrices[3]).toBeCloseTo(1, 5); // d
  });

  it('FORMULA parity: an inherit combo with NO named preset — keep rotation+scale, strip reflection', () => {
    // {rotation, scale} true but reflection false has no TransformMode2D preset; the factored boolean model
    // handles it. Under a reflected+scaled parent [2,0,0,-2] (det −4), it keeps the (2,2) scale but strips
    // the reflection, so the child basis is [2,0,0,2] (det +4) rather than Normal's [2,0,0,-2].
    const s = createSkeleton2D([
      makeBone({ scaleX: 2, scaleY: -2 }), // reflected (negative Y scale)
      makeBone({
        parentIndex: 0,
        transformMode: { reflection: false, rotation: true, scale: true, translation: true },
      }),
    ]);
    computeSkeleton2DWorldTransforms(s);
    const out = createMatrix();
    getSkeleton2DBoneWorldMatrix(out, s, 1);
    expect(out.a).toBeCloseTo(2, 5);
    expect(out.b).toBeCloseTo(0, 5);
    expect(out.c).toBeCloseTo(0, 5);
    expect(out.d).toBeCloseTo(2, 5); // reflection stripped: +2, not −2
    expect(out.a * out.d - out.c * out.b).toBeCloseTo(4, 5); // det positive (scale kept, reflection dropped)
  });

  // The fourth axis, and the one no preset reaches: every TransformMode2D inherits translation, so a bone
  // that strips it has to be hand-built — which Bone2D admits on purpose. Both halves are asserted from one
  // rig, because the stripped position alone would be satisfied by a bone that had simply come loose from
  // its parent: the basis must still carry the parent's 90° turn while the origin ignores it entirely.
  it('FORMULA parity: stripping translation takes the local (x, y) as the world position, basis still inherited', () => {
    const bones = (translation: boolean) => [
      makeBone({ rotation: 90, x: 10, y: 20 }),
      makeBone({
        parentIndex: 0,
        transformMode: { reflection: true, rotation: true, scale: true, translation },
        x: 3,
        y: 4,
      }),
    ];

    const stripped = createSkeleton2D(bones(false));
    computeSkeleton2DWorldTransforms(stripped);
    const inherited = createSkeleton2D(bones(true));
    computeSkeleton2DWorldTransforms(inherited);

    // Stripped: the local (3, 4) IS the world origin, and the parent's translation (10, 20) never applies.
    expect(stripped.worldMatrices[1 * 6 + 4]).toBeCloseTo(3, 5);
    expect(stripped.worldMatrices[1 * 6 + 5]).toBeCloseTo(4, 5);
    // Inherited: (3, 4) turned a quarter turn to (−4, 3), then placed at the parent's (10, 20).
    expect(inherited.worldMatrices[1 * 6 + 4]).toBeCloseTo(6, 5);
    expect(inherited.worldMatrices[1 * 6 + 5]).toBeCloseTo(23, 5);
    // The linear part is untouched by the translation axis — both still carry the parent's 90° turn.
    const out = createMatrix();
    getSkeleton2DBoneWorldMatrix(out, stripped, 1);
    expect(out.a).toBeCloseTo(0, 5);
    expect(out.b).toBeCloseTo(1, 5);
    expect(out.c).toBeCloseTo(-1, 5);
    expect(out.d).toBeCloseTo(0, 5);
  });
});

describe('createSkeleton2D', () => {
  it('sizes the flat buffers to 6 floats per bone', () => {
    const s = createSkeleton2D([makeBone(), makeBone({ parentIndex: 0 })]);
    expect(s.worldMatrices.length).toBe(12);
    expect(s.inverseBindMatrices.length).toBe(12);
    expect(s.boneMatrices.length).toBe(12);
    expect(s.slots).toBeNull();
  });
});

describe('disposeSkeleton2D', () => {
  it('clears bones and slots for GC', () => {
    const s = createSkeleton2D([makeBone()], []);
    disposeSkeleton2D(s);
    expect(s.bones.length).toBe(0);
    expect(s.slots).toBeNull();
  });
});

describe('equalsSkeleton2D', () => {
  it('is true for a fresh clone and false after a bone edit', () => {
    const s = createSkeleton2D([makeBone({ rotation: 15 })]);
    const c = cloneSkeleton2D(s);
    expect(equalsSkeleton2D(s, c)).toBe(true);
    c.bones[0].rotation = 16;
    expect(equalsSkeleton2D(s, c)).toBe(false);
  });
});

describe('getSkeleton2DBoneIndexByName', () => {
  it('finds a named bone and returns -1 for a miss', () => {
    const s = createSkeleton2D([makeBone({ name: 'root' }), makeBone({ parentIndex: 0, name: 'arm' })]);
    expect(getSkeleton2DBoneIndexByName(s, 'arm')).toBe(1);
    expect(getSkeleton2DBoneIndexByName(s, 'leg')).toBe(-1);
  });
});

describe('getSkeleton2DBoneWorldMatrix', () => {
  it('writes the world matrix in range and returns false out of range', () => {
    const s = createSkeleton2D([makeBone({ x: 7 })]);
    computeSkeleton2DWorldTransforms(s);
    const out = createMatrix();
    expect(getSkeleton2DBoneWorldMatrix(out, s, 0)).toBe(true);
    expect(out.tx).toBeCloseTo(7, 5);
    expect(getSkeleton2DBoneWorldMatrix(out, s, 5)).toBe(false);
    expect(getSkeleton2DBoneWorldMatrix(out, s, -1)).toBe(false);
  });
});

describe('getSkeleton2DSkin', () => {
  it('finds a skin by name and returns the null sentinel otherwise', () => {
    const skeleton = createSkeleton2D([makeBone({ name: 'root' })], [testSlot('head', 0)]);
    skeleton.skins = [
      { attachments: [], name: 'goblin' },
      { attachments: [], name: 'goblingirl' },
    ];
    expect(getSkeleton2DSkin(skeleton, 'goblingirl')!.name).toBe('goblingirl');
    expect(getSkeleton2DSkin(skeleton, 'nope')).toBeNull();
  });

  it('returns null for a rig carrying no wardrobe at all', () => {
    const skeleton = createSkeleton2D([makeBone({ name: 'root' })]);
    expect(getSkeleton2DSkin(skeleton, 'goblin')).toBeNull();
  });
});

describe('setSkeleton2DBindPose', () => {
  it('captures the inverse of the current world so the palette is identity at bind', () => {
    const s = createSkeleton2D([makeBone({ x: 4, rotation: 60, scaleX: 2 })]);
    computeSkeleton2DWorldTransforms(s);
    setSkeleton2DBindPose(s);
    computeSkeleton2DBoneMatrices(s);
    expect(s.boneMatrices[0]).toBeCloseTo(1, 4);
    expect(s.boneMatrices[3]).toBeCloseTo(1, 4);
    expect(s.boneMatrices[4]).toBeCloseTo(0, 4);
    expect(s.boneMatrices[5]).toBeCloseTo(0, 4);
  });
});

describe('setSkeleton2DSkin', () => {
  it('writes the skin attachments onto the slots they name', () => {
    const skeleton = createSkeleton2D([makeBone({ name: 'root' })], [testSlot('head', 0), testSlot('hand', 0)]);
    const hat = testRegion('hat');
    setSkeleton2DSkin(skeleton, { attachments: [{ attachment: hat, name: 'head', slotIndex: 0 }], name: 'goblin' });
    expect(skeleton.slots![0].attachment).toBe(hat);
  });

  it('LEAVES slots the skin does not mention alone, so a partial skin layers over a base', () => {
    const base = testRegion('body');
    const skeleton = createSkeleton2D([makeBone({ name: 'root' })], [testSlot('head', 0), testSlot('body', 0)]);
    skeleton.slots![1].attachment = base;
    const hat = testRegion('hat');
    setSkeleton2DSkin(skeleton, { attachments: [{ attachment: hat, name: 'head', slotIndex: 0 }], name: 'goblin' });
    expect(skeleton.slots![0].attachment).toBe(hat);
    expect(skeleton.slots![1].attachment).toBe(base); // shared art survives the overlay
  });

  it('skips an entry naming a slot outside the skeleton rather than throwing', () => {
    const skeleton = createSkeleton2D([makeBone({ name: 'root' })], [testSlot('head', 0)]);
    expect(() =>
      setSkeleton2DSkin(skeleton, {
        attachments: [
          { attachment: testRegion('ghost'), name: 'ghost', slotIndex: 9 },
          { attachment: testRegion('ghost2'), name: 'ghost2', slotIndex: -1 },
        ],
        name: 'broken',
      }),
    ).not.toThrow();
    expect(skeleton.slots![0].attachment).toBeNull();
  });

  it('is a no-op on a skeleton with no slots', () => {
    const skeleton = createSkeleton2D([makeBone({ name: 'root' })]);
    expect(() =>
      setSkeleton2DSkin(skeleton, {
        attachments: [{ attachment: testRegion('x'), name: 'x', slotIndex: 0 }],
        name: 's',
      }),
    ).not.toThrow();
  });
});

describe('validateSkeleton2D', () => {
  it('returns null for a valid parent-before-child skeleton', () => {
    const s = createSkeleton2D([makeBone(), makeBone({ parentIndex: 0 })]);
    expect(validateSkeleton2D(s)).toBeNull();
  });

  it('reports a child whose parentIndex is not before it', () => {
    const s = createSkeleton2D([makeBone({ parentIndex: 1 }), makeBone({ parentIndex: 0 })]);
    expect(validateSkeleton2D(s)).toContain('parent-before-child');
  });

  it('reports a mis-sized buffer', () => {
    const s = createSkeleton2D([makeBone()]);
    s.worldMatrices = new Float32Array(3);
    expect(validateSkeleton2D(s)).toContain('worldMatrices');
  });
});

// A minimal slot for wardrobe tests: no attachment until a skin supplies one.
function testSlot(name: string, boneIndex: number): Slot2D {
  return { attachment: null, boneIndex, color: 0xffffffff, name };
}

function testRegion(name: string): RegionAttachment2D {
  const out = allocateEntity<Slot2D>();
  out.height = 0;
  out.kind = RegionAttachment2DKind;
  out.name = name;
  out.rotation = 0;
  out.scaleX = 1;
  out.scaleY = 1;
  out.width = 0;
  out.x = 0;
  out.y = 0;
  return finishEntity(out) as RegionAttachment2D;
}
