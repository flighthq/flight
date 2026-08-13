import { createMatrix4, getMatrix4Element, setVector3 } from '@flighthq/geometry/contract';
import { addNodeChild, getNodeParent, invalidateNodeLocalTransform, setNodeTransform3D } from '@flighthq/node/contract';
import { createNode3D } from '@flighthq/scene3d/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

import {
  cloneSkeleton3D,
  cloneSkeleton3DJointHierarchy,
  computeSkeleton3DJointMatrices,
  createSkeleton3D,
  disposeSkeleton3D,
  equalsSkeleton3D,
  getSkeleton3DJointIndexByName,
  getSkeleton3DJointWorldMatrix,
  getSkeleton3DJointWorldMatrixByName,
  setSkeleton3DBindPose,
  setSkeleton3DBindPoseGuard,
  validateSkeleton3D,
} from './skeleton3d';

describe('cloneSkeleton3D', () => {
  it('copies buffers and arrays into a new identity while sharing joint nodes', () => {
    const joint = createNode3D();
    setVector3(joint.position, 5, 0, 0);
    invalidateNodeLocalTransform(joint);
    const skeleton = createSkeleton3D([joint], undefined, ['root']);

    const clone = cloneSkeleton3D(skeleton);

    expect(clone).not.toBe(skeleton);
    expect(clone.inverseBindMatrices).not.toBe(skeleton.inverseBindMatrices);
    expect(clone.jointMatrices).not.toBe(skeleton.jointMatrices);
    expect(clone.joints).not.toBe(skeleton.joints);
    expect(clone.joints[0]).toBe(joint); // node shared by reference
    expect(Array.from(clone.inverseBindMatrices)).toEqual(Array.from(skeleton.inverseBindMatrices));
    expect(clone.names).toEqual(['root']);
    expect(clone.names).not.toBe(skeleton.names);
    expect(EntityRuntimeKey in clone).toBe(true);
  });

  it('preserves a null names field', () => {
    const clone = cloneSkeleton3D(createSkeleton3D([createNode3D()]));
    expect(clone.names).toBeNull();
  });
});

describe('cloneSkeleton3DJointHierarchy', () => {
  it('rebuilds joint parentage over fresh nodes and isolates pose updates', () => {
    const root = createNode3D();
    const child = createNode3D();
    setVector3(root.position, 1, 0, 0);
    setVector3(child.position, 0, 2, 0);
    invalidateNodeLocalTransform(root);
    invalidateNodeLocalTransform(child);
    addNodeChild(root, child);
    const source = createSkeleton3D([root, child], undefined, ['root', 'child']);

    const clone = cloneSkeleton3DJointHierarchy(source, (joint) => {
      const out = createNode3D(joint.kind, joint);
      setNodeTransform3D(out, joint);
      return out;
    });

    expect(clone.joints[0]).not.toBe(root);
    expect(clone.joints[1]).not.toBe(child);
    expect(getNodeParent(clone.joints[0])).toBeNull();
    expect(getNodeParent(clone.joints[1])).toBe(clone.joints[0]);
    expect(getNodeParent(child)).toBe(root);
    expect(clone.inverseBindMatrices).not.toBe(source.inverseBindMatrices);
    expect(clone.names).toEqual(['root', 'child']);

    setVector3(clone.joints[0].position, 6, 0, 0);
    invalidateNodeLocalTransform(clone.joints[0]);
    computeSkeleton3DJointMatrices(source);
    computeSkeleton3DJointMatrices(clone);
    expect(source.jointMatrices[12]).toBeCloseTo(0);
    expect(clone.jointMatrices[12]).toBeCloseTo(5);
    expect(source.jointMatrices[28]).toBeCloseTo(0);
    expect(clone.jointMatrices[28]).toBeCloseTo(5);
  });
});

describe('computeSkeleton3DJointMatrices', () => {
  it('encodes the joint delta from its bind pose', () => {
    const joint = createNode3D();
    setVector3(joint.position, 5, 0, 0);
    invalidateNodeLocalTransform(joint);
    const skeleton = createSkeleton3D([joint]); // binds at (5, 0, 0)
    setVector3(joint.position, 5, 3, 0); // move +3 in y
    invalidateNodeLocalTransform(joint);

    computeSkeleton3DJointMatrices(skeleton);

    expect(skeleton.jointMatrices[12]).toBeCloseTo(0); // x delta
    expect(skeleton.jointMatrices[13]).toBeCloseTo(3); // y delta
  });

  it('is alias-safe when jointMatrices and inverseBindMatrices share the same buffer', () => {
    const joint0 = createNode3D();
    const joint1 = createNode3D();
    setVector3(joint0.position, 0, 0, 0);
    invalidateNodeLocalTransform(joint0);
    setVector3(joint1.position, 3, 0, 0);
    invalidateNodeLocalTransform(joint1);

    const temp = createSkeleton3D([joint0, joint1]);
    const shared = new Float32Array(32);
    shared.set(temp.inverseBindMatrices);

    const aliasSkeleton = createSkeleton3D([joint0, joint1]);
    aliasSkeleton.inverseBindMatrices = shared;
    aliasSkeleton.jointMatrices = shared;

    computeSkeleton3DJointMatrices(aliasSkeleton);

    expect(shared[12]).toBeCloseTo(0); // joint0 tx
    expect(shared[13]).toBeCloseTo(0); // joint0 ty
    expect(shared[28]).toBeCloseTo(0); // joint1 tx
    expect(shared[29]).toBeCloseTo(0); // joint1 ty
  });

  it('propagates correctly through a 3-joint chain', () => {
    const joint0 = createNode3D();
    const joint1 = createNode3D();
    const joint2 = createNode3D();
    setVector3(joint0.position, 1, 0, 0);
    invalidateNodeLocalTransform(joint0);
    setVector3(joint1.position, 0, 1, 0);
    invalidateNodeLocalTransform(joint1);
    setVector3(joint2.position, 0, 0, 1);
    invalidateNodeLocalTransform(joint2);
    const skeleton = createSkeleton3D([joint0, joint1, joint2]);

    setVector3(joint1.position, 0, 2, 0);
    invalidateNodeLocalTransform(joint1);

    computeSkeleton3DJointMatrices(skeleton);

    expect(skeleton.jointMatrices[12]).toBeCloseTo(0);
    expect(skeleton.jointMatrices[13]).toBeCloseTo(0);
    expect(skeleton.jointMatrices[14]).toBeCloseTo(0);

    expect(skeleton.jointMatrices[28]).toBeCloseTo(0);
    expect(skeleton.jointMatrices[29]).toBeCloseTo(1);
    expect(skeleton.jointMatrices[30]).toBeCloseTo(0);

    expect(skeleton.jointMatrices[44]).toBeCloseTo(0);
    expect(skeleton.jointMatrices[45]).toBeCloseTo(0);
    expect(skeleton.jointMatrices[46]).toBeCloseTo(0);
  });

  it('yields identity when a joint is at its bind pose', () => {
    const joint = createNode3D();
    setVector3(joint.position, 5, 0, 0);
    invalidateNodeLocalTransform(joint);
    const skeleton = createSkeleton3D([joint]);

    computeSkeleton3DJointMatrices(skeleton);

    expect(skeleton.jointMatrices[0]).toBeCloseTo(1);
    expect(skeleton.jointMatrices[12]).toBeCloseTo(0);
    expect(skeleton.jointMatrices[13]).toBeCloseTo(0);
  });
});

describe('computeSkeleton3DJointMatrices normal palette', () => {
  // ★ THIS COVERS THE FILL, WHICH NOTHING ELSE DID. The skinning tests build palettes directly, so they
  // are structurally blind to whether this function writes the layout the shader and the CPU both read.
  // A mutation that wrote the columns tightly instead of padded passed the entire suite until this
  // existed — the same "a unit test of the callee says nothing about the caller" gap as elsewhere.
  it('writes each joint as three vec4-padded columns, twelve floats apart', () => {
    const joint = createNode3D();
    // The bind pose is captured at construction, so the scale must be applied AFTER it — otherwise the
    // joint matrix is world times inverse-world, the identity, and the palette says nothing.
    const skeleton = createSkeleton3D([joint]);
    setVector3(joint.scale, 2, 1, 1);
    invalidateNodeLocalTransform(joint);
    computeSkeleton3DJointMatrices(skeleton);

    expect(skeleton.normalMatrices.length).toBe(12);
    // A 2x stretch in x gives a normal matrix scaling x by 1/2 — the inverse-transpose, not the matrix.
    expect(skeleton.normalMatrices[0]).toBeCloseTo(0.5);
    // Column 1 starts at float 4, not float 3. If the stride were tight this would hold the y column's
    // first element at index 3 and this assertion would read padding instead.
    expect(skeleton.normalMatrices[3]).toBe(0);
    expect(skeleton.normalMatrices[5]).toBeCloseTo(1);
    expect(skeleton.normalMatrices[10]).toBeCloseTo(1);
  });
});

describe('createSkeleton3D', () => {
  it('allocates a palette sized to the joint count when no inverse-bind is given', () => {
    const skeleton = createSkeleton3D([createNode3D(), createNode3D()]);
    expect(skeleton.jointMatrices.length).toBe(32);
    expect(skeleton.inverseBindMatrices.length).toBe(32);
    expect(EntityRuntimeKey in skeleton).toBe(true);
  });
});

describe('disposeSkeleton3D', () => {
  it('drops joint references and clears names', () => {
    const skeleton = createSkeleton3D([createNode3D(), createNode3D()], undefined, ['a', 'b']);
    disposeSkeleton3D(skeleton);
    expect(skeleton.joints.length).toBe(0);
    expect(skeleton.names).toBeNull();
  });
});

describe('equalsSkeleton3D', () => {
  it('is reflexive and compares clones as equal', () => {
    const joint = createNode3D();
    setVector3(joint.position, 2, 0, 0);
    invalidateNodeLocalTransform(joint);
    const skeleton = createSkeleton3D([joint], undefined, ['root']);
    expect(equalsSkeleton3D(skeleton, skeleton)).toBe(true);
    expect(equalsSkeleton3D(skeleton, cloneSkeleton3D(skeleton))).toBe(true);
  });

  it('differs on joint count, inverse-bind contents, and names', () => {
    const j0 = createNode3D();
    setVector3(j0.position, 1, 0, 0);
    invalidateNodeLocalTransform(j0);
    const a = createSkeleton3D([j0]);

    const j1 = createNode3D();
    setVector3(j1.position, 9, 0, 0);
    invalidateNodeLocalTransform(j1);
    const differentBind = createSkeleton3D([j1]);
    expect(equalsSkeleton3D(a, differentBind)).toBe(false);

    const extra = createSkeleton3D([createNode3D(), createNode3D()]);
    expect(equalsSkeleton3D(a, extra)).toBe(false);

    const named = createSkeleton3D([j0], a.inverseBindMatrices, ['root']);
    const unnamed = createSkeleton3D([j0], a.inverseBindMatrices);
    expect(equalsSkeleton3D(named, unnamed)).toBe(false);
    expect(equalsSkeleton3D(named, createSkeleton3D([j0], a.inverseBindMatrices, ['other']))).toBe(false);
  });
});

describe('getSkeleton3DJointIndexByName', () => {
  it('returns the joint index or -1 when unnamed or missing', () => {
    const skeleton = createSkeleton3D([createNode3D(), createNode3D()], undefined, ['hip', 'spine']);
    expect(getSkeleton3DJointIndexByName(skeleton, 'spine')).toBe(1);
    expect(getSkeleton3DJointIndexByName(skeleton, 'missing')).toBe(-1);
    expect(getSkeleton3DJointIndexByName(createSkeleton3D([createNode3D()]), 'hip')).toBe(-1);
  });
});

describe('getSkeleton3DJointWorldMatrix', () => {
  it('reads the joint world matrix into out and returns true', () => {
    const joint = createNode3D();
    setVector3(joint.position, 5, 3, 0);
    invalidateNodeLocalTransform(joint);
    const skeleton = createSkeleton3D([joint]);
    const out = createMatrix4();

    expect(getSkeleton3DJointWorldMatrix(out, skeleton, 0)).toBe(true);
    expect(getMatrix4Element(out, 0, 3)).toBeCloseTo(5);
    expect(getMatrix4Element(out, 1, 3)).toBeCloseTo(3);
  });

  it('returns false and leaves out untouched for an out-of-range index', () => {
    const skeleton = createSkeleton3D([createNode3D()]);
    const out = createMatrix4();
    expect(getSkeleton3DJointWorldMatrix(out, skeleton, 5)).toBe(false);
    expect(getSkeleton3DJointWorldMatrix(out, skeleton, -1)).toBe(false);
    expect(getMatrix4Element(out, 0, 3)).toBeCloseTo(0);
  });
});

describe('getSkeleton3DJointWorldMatrixByName', () => {
  it('resolves the joint by name and reads its world matrix', () => {
    const hip = createNode3D();
    const hand = createNode3D();
    setVector3(hand.position, 7, 0, 0);
    invalidateNodeLocalTransform(hand);
    const skeleton = createSkeleton3D([hip, hand], undefined, ['hip', 'hand']);
    const out = createMatrix4();

    expect(getSkeleton3DJointWorldMatrixByName(out, skeleton, 'hand')).toBe(true);
    expect(getMatrix4Element(out, 0, 3)).toBeCloseTo(7);
    expect(getSkeleton3DJointWorldMatrixByName(out, skeleton, 'missing')).toBe(false);
  });
});

describe('setSkeleton3DBindPose', () => {
  // A zero-scale joint makes its world matrix singular. Writing the failed inverse puts NaN in the
  // palette, which reaches the skinned vertices silently; identity costs that one joint its bind pose
  // and leaves every other joint working — the AWD2 recovery, applied per joint.
  it('substitutes identity for a joint with no invertible world matrix, leaving the rest of the rig', () => {
    const collapsed = createNode3D();
    const healthy = createNode3D();
    const skeleton = createSkeleton3D([collapsed, healthy]);
    setVector3(collapsed.scale, 0, 0, 0);
    setVector3(healthy.position, 3, 0, 0);
    invalidateNodeLocalTransform(collapsed);
    invalidateNodeLocalTransform(healthy);

    setSkeleton3DBindPose(skeleton);

    for (const value of skeleton.inverseBindMatrices) expect(Number.isFinite(value)).toBe(true);
    // The collapsed joint got identity...
    expect(Array.from(skeleton.inverseBindMatrices.slice(0, 16))).toEqual([
      1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1,
    ]);
    // ...and the healthy joint still got its real inverse bind.
    expect(skeleton.inverseBindMatrices[28]).toBeCloseTo(-3);
  });

  it('rebinds so the current pose becomes the rest pose', () => {
    const joint = createNode3D();
    const skeleton = createSkeleton3D([joint]);
    setVector3(joint.position, 2, 0, 0);
    invalidateNodeLocalTransform(joint);
    setSkeleton3DBindPose(skeleton);

    computeSkeleton3DJointMatrices(skeleton);

    expect(skeleton.jointMatrices[12]).toBeCloseTo(0);
  });
});

describe('setSkeleton3DBindPoseGuard', () => {
  it('is notified for the degenerate joint only', () => {
    const seen: number[] = [];
    setSkeleton3DBindPoseGuard((_skeleton, jointIndex) => seen.push(jointIndex));
    try {
      const collapsed = createNode3D();
      const healthy = createNode3D();
      const skeleton = createSkeleton3D([healthy, collapsed]);
      setVector3(collapsed.scale, 0, 0, 0);
      invalidateNodeLocalTransform(collapsed);
      invalidateNodeLocalTransform(healthy);
      setSkeleton3DBindPose(skeleton);
      expect(seen).toEqual([1]);
    } finally {
      setSkeleton3DBindPoseGuard(null);
    }
  });
});

describe('validateSkeleton3D', () => {
  it('returns null for a well-formed skeleton', () => {
    expect(validateSkeleton3D(createSkeleton3D([createNode3D(), createNode3D()]))).toBeNull();
  });

  it('returns a diagnostic when inverseBindMatrices length does not match jointCount * 16', () => {
    const skeleton = createSkeleton3D([createNode3D(), createNode3D()]);
    skeleton.inverseBindMatrices = new Float32Array(16);

    const diagnostic = validateSkeleton3D(skeleton);
    expect(diagnostic).not.toBeNull();
    expect(diagnostic!.jointCount).toBe(2);
    expect(diagnostic!.expectedInverseBindMatricesLength).toBe(32);
    expect(diagnostic!.inverseBindMatricesLength).toBe(16);
    expect(diagnostic!.message).toContain('does not match');
  });
});
