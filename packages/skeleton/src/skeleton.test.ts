import { createSceneNode, setSceneNodePosition } from '@flighthq/scene';
import type { Skeleton } from '@flighthq/types';

import { computeSkeletonJointMatrices, createSkeleton, setSkeletonBindPose } from './skeleton';

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
