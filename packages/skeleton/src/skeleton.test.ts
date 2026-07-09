import { createMatrix4, getMatrix4Element } from '@flighthq/geometry';
import { createSceneNode, setSceneNodePosition } from '@flighthq/scene';
import type { Skeleton } from '@flighthq/types';

import {
  cloneSkeleton,
  computeSkeletonJointMatrices,
  createSkeleton,
  disposeSkeleton,
  equalsSkeleton,
  getSkeletonJointIndexByName,
  getSkeletonJointWorldMatrix,
  getSkeletonJointWorldMatrixByName,
  setSkeletonBindPose,
  validateSkeleton,
} from './skeleton';

describe('cloneSkeleton', () => {
  it('copies buffers and arrays into a new identity while sharing joint nodes', () => {
    const joint = createSceneNode();
    setSceneNodePosition(joint, 5, 0, 0);
    const skeleton = createSkeleton([joint], undefined, ['root']);

    const clone = cloneSkeleton(skeleton);

    expect(clone).not.toBe(skeleton);
    expect(clone.inverseBindMatrices).not.toBe(skeleton.inverseBindMatrices);
    expect(clone.jointMatrices).not.toBe(skeleton.jointMatrices);
    expect(clone.joints).not.toBe(skeleton.joints);
    expect(clone.joints[0]).toBe(joint); // node shared by reference
    expect(Array.from(clone.inverseBindMatrices)).toEqual(Array.from(skeleton.inverseBindMatrices));
    expect(clone.names).toEqual(['root']);
    expect(clone.names).not.toBe(skeleton.names);
  });

  it('preserves a null names field', () => {
    const clone = cloneSkeleton(createSkeleton([createSceneNode()]));
    expect(clone.names).toBeNull();
  });
});

describe('computeSkeletonJointMatrices', () => {
  it('encodes the joint delta from its bind pose', () => {
    const joint = createSceneNode();
    setSceneNodePosition(joint, 5, 0, 0);
    const skeleton = createSkeleton([joint]); // binds at (5, 0, 0)
    setSceneNodePosition(joint, 5, 3, 0); // move +3 in y

    computeSkeletonJointMatrices(skeleton);

    expect(skeleton.jointMatrices[12]).toBeCloseTo(0); // x delta
    expect(skeleton.jointMatrices[13]).toBeCloseTo(3); // y delta
  });

  it('is alias-safe when jointMatrices and inverseBindMatrices share the same buffer', () => {
    const joint0 = createSceneNode();
    const joint1 = createSceneNode();
    setSceneNodePosition(joint0, 0, 0, 0);
    setSceneNodePosition(joint1, 3, 0, 0);

    // Capture real inverse bind matrices via a temp skeleton, then copy into a shared buffer.
    const temp = createSkeleton([joint0, joint1]);
    const shared = new Float32Array(32);
    shared.set(temp.inverseBindMatrices);

    // Both joints are at their bind poses, so result must be identity even when in/out alias.
    const aliasSkeleton: Skeleton = {
      inverseBindMatrices: shared,
      jointMatrices: shared,
      joints: [joint0, joint1],
    };

    computeSkeletonJointMatrices(aliasSkeleton);

    // joint0: translation column at offsets 12-14 must be zero
    expect(shared[12]).toBeCloseTo(0); // joint0 tx
    expect(shared[13]).toBeCloseTo(0); // joint0 ty
    // joint1: translation column at base 16, offsets 28-30
    expect(shared[28]).toBeCloseTo(0); // joint1 tx
    expect(shared[29]).toBeCloseTo(0); // joint1 ty
  });

  it('propagates correctly through a 3-joint chain', () => {
    const joint0 = createSceneNode();
    const joint1 = createSceneNode();
    const joint2 = createSceneNode();
    setSceneNodePosition(joint0, 1, 0, 0);
    setSceneNodePosition(joint1, 0, 1, 0);
    setSceneNodePosition(joint2, 0, 0, 1);
    const skeleton = createSkeleton([joint0, joint1, joint2]); // bind at those positions

    // Move only joint1 by +1 in y; joint0 and joint2 stay at their bind poses.
    setSceneNodePosition(joint1, 0, 2, 0);

    computeSkeletonJointMatrices(skeleton);

    // joint0 (base 0): unchanged — palette entry is identity
    expect(skeleton.jointMatrices[12]).toBeCloseTo(0); // tx
    expect(skeleton.jointMatrices[13]).toBeCloseTo(0); // ty
    expect(skeleton.jointMatrices[14]).toBeCloseTo(0); // tz

    // joint1 (base 16): moved +1 in y from bind — palette entry encodes (0, 1, 0) translation
    expect(skeleton.jointMatrices[28]).toBeCloseTo(0); // tx  (16 + 12)
    expect(skeleton.jointMatrices[29]).toBeCloseTo(1); // ty  (16 + 13)
    expect(skeleton.jointMatrices[30]).toBeCloseTo(0); // tz  (16 + 14)

    // joint2 (base 32): unchanged — palette entry is identity
    expect(skeleton.jointMatrices[44]).toBeCloseTo(0); // tx  (32 + 12)
    expect(skeleton.jointMatrices[45]).toBeCloseTo(0); // ty  (32 + 13)
    expect(skeleton.jointMatrices[46]).toBeCloseTo(0); // tz  (32 + 14)
  });

  it('yields identity when a joint is at its bind pose', () => {
    const joint = createSceneNode();
    setSceneNodePosition(joint, 5, 0, 0);
    const skeleton = createSkeleton([joint]); // binds at (5, 0, 0)

    computeSkeletonJointMatrices(skeleton);

    expect(skeleton.jointMatrices[0]).toBeCloseTo(1); // m00
    expect(skeleton.jointMatrices[12]).toBeCloseTo(0); // tx
    expect(skeleton.jointMatrices[13]).toBeCloseTo(0); // ty
  });
});

describe('createSkeleton', () => {
  it('allocates a palette sized to the joint count when no inverse-bind is given', () => {
    const skeleton = createSkeleton([createSceneNode(), createSceneNode()]);
    expect(skeleton.jointMatrices.length).toBe(32);
    expect(skeleton.inverseBindMatrices.length).toBe(32);
  });
});

describe('disposeSkeleton', () => {
  it('drops joint references and clears names', () => {
    const skeleton = createSkeleton([createSceneNode(), createSceneNode()], undefined, ['a', 'b']);
    disposeSkeleton(skeleton);
    expect(skeleton.joints.length).toBe(0);
    expect(skeleton.names).toBeNull();
  });
});

describe('equalsSkeleton', () => {
  it('is reflexive and compares clones as equal', () => {
    const joint = createSceneNode();
    setSceneNodePosition(joint, 2, 0, 0);
    const skeleton = createSkeleton([joint], undefined, ['root']);
    expect(equalsSkeleton(skeleton, skeleton)).toBe(true);
    expect(equalsSkeleton(skeleton, cloneSkeleton(skeleton))).toBe(true);
  });

  it('differs on joint count, inverse-bind contents, and names', () => {
    const j0 = createSceneNode();
    setSceneNodePosition(j0, 1, 0, 0);
    const a = createSkeleton([j0]);

    const j1 = createSceneNode();
    setSceneNodePosition(j1, 9, 0, 0);
    const differentBind = createSkeleton([j1]);
    expect(equalsSkeleton(a, differentBind)).toBe(false);

    const extra = createSkeleton([createSceneNode(), createSceneNode()]);
    expect(equalsSkeleton(a, extra)).toBe(false);

    const named = createSkeleton([j0], a.inverseBindMatrices, ['root']);
    const unnamed = createSkeleton([j0], a.inverseBindMatrices);
    expect(equalsSkeleton(named, unnamed)).toBe(false);
    expect(equalsSkeleton(named, createSkeleton([j0], a.inverseBindMatrices, ['other']))).toBe(false);
  });
});

describe('getSkeletonJointIndexByName', () => {
  it('returns the joint index or -1 when unnamed or missing', () => {
    const skeleton = createSkeleton([createSceneNode(), createSceneNode()], undefined, ['hip', 'spine']);
    expect(getSkeletonJointIndexByName(skeleton, 'spine')).toBe(1);
    expect(getSkeletonJointIndexByName(skeleton, 'missing')).toBe(-1);
    expect(getSkeletonJointIndexByName(createSkeleton([createSceneNode()]), 'hip')).toBe(-1);
  });
});

describe('getSkeletonJointWorldMatrix', () => {
  it('reads the joint world matrix into out and returns true', () => {
    const joint = createSceneNode();
    setSceneNodePosition(joint, 5, 3, 0);
    const skeleton = createSkeleton([joint]);
    const out = createMatrix4();

    expect(getSkeletonJointWorldMatrix(out, skeleton, 0)).toBe(true);
    expect(getMatrix4Element(out, 0, 3)).toBeCloseTo(5); // world translation x
    expect(getMatrix4Element(out, 1, 3)).toBeCloseTo(3); // world translation y
  });

  it('returns false and leaves out untouched for an out-of-range index', () => {
    const skeleton = createSkeleton([createSceneNode()]);
    const out = createMatrix4();
    expect(getSkeletonJointWorldMatrix(out, skeleton, 5)).toBe(false);
    expect(getSkeletonJointWorldMatrix(out, skeleton, -1)).toBe(false);
    expect(getMatrix4Element(out, 0, 3)).toBeCloseTo(0); // still identity
  });
});

describe('getSkeletonJointWorldMatrixByName', () => {
  it('resolves the joint by name and reads its world matrix', () => {
    const hip = createSceneNode();
    const hand = createSceneNode();
    setSceneNodePosition(hand, 7, 0, 0);
    const skeleton = createSkeleton([hip, hand], undefined, ['hip', 'hand']);
    const out = createMatrix4();

    expect(getSkeletonJointWorldMatrixByName(out, skeleton, 'hand')).toBe(true);
    expect(getMatrix4Element(out, 0, 3)).toBeCloseTo(7);
    expect(getSkeletonJointWorldMatrixByName(out, skeleton, 'missing')).toBe(false);
  });
});

describe('setSkeletonBindPose', () => {
  it('rebinds so the current pose becomes the rest pose', () => {
    const joint = createSceneNode();
    const skeleton = createSkeleton([joint]); // bind at origin
    setSceneNodePosition(joint, 2, 0, 0);
    setSkeletonBindPose(skeleton); // rebind at (2, 0, 0)

    computeSkeletonJointMatrices(skeleton);

    expect(skeleton.jointMatrices[12]).toBeCloseTo(0); // identity again
  });
});

describe('validateSkeleton', () => {
  it('returns null for a well-formed skeleton', () => {
    expect(validateSkeleton(createSkeleton([createSceneNode(), createSceneNode()]))).toBeNull();
  });

  it('returns a diagnostic when inverseBindMatrices length does not match jointCount * 16', () => {
    const skeleton = createSkeleton([createSceneNode(), createSceneNode()]);
    skeleton.inverseBindMatrices = new Float32Array(16); // only one joint's worth for two joints

    const diagnostic = validateSkeleton(skeleton);
    expect(diagnostic).not.toBeNull();
    expect(diagnostic!.jointCount).toBe(2);
    expect(diagnostic!.expectedInverseBindMatricesLength).toBe(32);
    expect(diagnostic!.inverseBindMatricesLength).toBe(16);
    expect(diagnostic!.message).toContain('does not match');
  });
});
