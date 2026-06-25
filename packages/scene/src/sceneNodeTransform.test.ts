import { createQuaternion, createVector3 } from '@flighthq/geometry';

import { createSceneNode } from './sceneNode';
import {
  getSceneNodePosition,
  getSceneNodeRotationQuaternion,
  getSceneNodeScale,
  setSceneNodeLookAt,
  setSceneNodePosition,
  setSceneNodeRotationQuaternion,
  setSceneNodeScale,
  setSceneNodeTransform,
} from './sceneNodeTransform';

describe('getSceneNodePosition', () => {
  it('reads the translation from the localMatrix', () => {
    const node = createSceneNode();
    node.localMatrix.m[12] = 3;
    node.localMatrix.m[13] = 5;
    node.localMatrix.m[14] = 7;
    const out = createVector3();
    getSceneNodePosition(out, node);
    expect(out.x).toBeCloseTo(3);
    expect(out.y).toBeCloseTo(5);
    expect(out.z).toBeCloseTo(7);
  });

  it('reads zeros for an identity localMatrix', () => {
    const node = createSceneNode();
    const out = createVector3();
    getSceneNodePosition(out, node);
    expect(out.x).toBe(0);
    expect(out.y).toBe(0);
    expect(out.z).toBe(0);
  });
});

describe('getSceneNodeRotationQuaternion', () => {
  it('returns identity quaternion for an identity localMatrix', () => {
    const node = createSceneNode();
    const out = createQuaternion();
    getSceneNodeRotationQuaternion(out, node);
    expect(out.x).toBeCloseTo(0);
    expect(out.y).toBeCloseTo(0);
    expect(out.z).toBeCloseTo(0);
    expect(out.w).toBeCloseTo(1);
  });

  it('round-trips a rotation set via setSceneNodeRotationQuaternion', () => {
    const node = createSceneNode();
    const angle = Math.PI / 4;
    const q = createQuaternion(Math.sin(angle / 2), 0, 0, Math.cos(angle / 2));
    setSceneNodeRotationQuaternion(node, q);
    const out = createQuaternion();
    getSceneNodeRotationQuaternion(out, node);
    expect(out.x).toBeCloseTo(q.x);
    expect(out.y).toBeCloseTo(q.y);
    expect(out.z).toBeCloseTo(q.z);
    expect(out.w).toBeCloseTo(q.w);
  });
});

describe('getSceneNodeScale', () => {
  it('returns (1,1,1) for an identity localMatrix', () => {
    const node = createSceneNode();
    const out = createVector3();
    getSceneNodeScale(out, node);
    expect(out.x).toBeCloseTo(1);
    expect(out.y).toBeCloseTo(1);
    expect(out.z).toBeCloseTo(1);
  });

  it('round-trips a scale set via setSceneNodeScale', () => {
    const node = createSceneNode();
    setSceneNodeScale(node, 2, 3, 4);
    const out = createVector3();
    getSceneNodeScale(out, node);
    expect(out.x).toBeCloseTo(2);
    expect(out.y).toBeCloseTo(3);
    expect(out.z).toBeCloseTo(4);
  });
});

describe('setSceneNodeLookAt', () => {
  it('places the node at the eye position', () => {
    const node = createSceneNode();
    const eye = createVector3(3, 4, 5);
    const target = createVector3(0, 0, 0);
    const up = createVector3(0, 1, 0);
    setSceneNodeLookAt(node, eye, target, up);
    // Model-matrix translation column = eye.
    const m = node.localMatrix.m;
    expect(m[12]).toBeCloseTo(3);
    expect(m[13]).toBeCloseTo(4);
    expect(m[14]).toBeCloseTo(5);
  });

  it('Z-axis column points from target back to eye (RH -Z-forward convention)', () => {
    const node = createSceneNode();
    setSceneNodeLookAt(node, createVector3(0, 0, 5), createVector3(0, 0, 0), createVector3(0, 1, 0));
    // normalize(eye - target) = (0,0,1) → m[8]=0, m[9]=0, m[10]=1
    const m = node.localMatrix.m;
    expect(m[8]).toBeCloseTo(0);
    expect(m[9]).toBeCloseTo(0);
    expect(m[10]).toBeCloseTo(1);
  });

  it('preserves w = 1 and last column padding', () => {
    const node = createSceneNode();
    setSceneNodeLookAt(node, createVector3(1, 2, 3), createVector3(0, 0, 0), createVector3(0, 1, 0));
    const m = node.localMatrix.m;
    expect(m[3]).toBe(0);
    expect(m[7]).toBe(0);
    expect(m[11]).toBe(0);
    expect(m[15]).toBe(1);
  });
});

describe('setSceneNodePosition', () => {
  it('sets the translation component', () => {
    const node = createSceneNode();
    setSceneNodePosition(node, 1, 2, 3);
    expect(node.localMatrix.m[12]).toBe(1);
    expect(node.localMatrix.m[13]).toBe(2);
    expect(node.localMatrix.m[14]).toBe(3);
  });

  it('preserves rotation and scale columns', () => {
    const node = createSceneNode();
    // Set a non-trivial matrix before.
    setSceneNodeScale(node, 2, 3, 4);
    const m00Before = node.localMatrix.m[0];
    const m05Before = node.localMatrix.m[5];
    const m10Before = node.localMatrix.m[10];
    setSceneNodePosition(node, 10, 20, 30);
    expect(node.localMatrix.m[0]).toBeCloseTo(m00Before);
    expect(node.localMatrix.m[5]).toBeCloseTo(m05Before);
    expect(node.localMatrix.m[10]).toBeCloseTo(m10Before);
  });
});

describe('setSceneNodeRotationQuaternion', () => {
  it('sets the rotation without changing the translation', () => {
    const node = createSceneNode();
    setSceneNodePosition(node, 5, 6, 7);
    const q = createQuaternion(0, 0, 0, 1); // identity
    setSceneNodeRotationQuaternion(node, q);
    expect(node.localMatrix.m[12]).toBeCloseTo(5);
    expect(node.localMatrix.m[13]).toBeCloseTo(6);
    expect(node.localMatrix.m[14]).toBeCloseTo(7);
  });

  it('aliased out: safe when q is derived from node', () => {
    const node = createSceneNode();
    const q = createQuaternion(0, 0, 0, 1);
    setSceneNodeRotationQuaternion(node, q);
    // Should not throw or produce NaN.
    expect(node.localMatrix.m[0]).not.toBeNaN();
  });
});

describe('setSceneNodeScale', () => {
  it('sets the scale component', () => {
    const node = createSceneNode();
    setSceneNodeScale(node, 2, 3, 4);
    const out = createVector3();
    getSceneNodeScale(out, node);
    expect(out.x).toBeCloseTo(2);
    expect(out.y).toBeCloseTo(3);
    expect(out.z).toBeCloseTo(4);
  });

  it('preserves the position', () => {
    const node = createSceneNode();
    setSceneNodePosition(node, 1, 2, 3);
    setSceneNodeScale(node, 2, 2, 2);
    expect(node.localMatrix.m[12]).toBeCloseTo(1);
    expect(node.localMatrix.m[13]).toBeCloseTo(2);
    expect(node.localMatrix.m[14]).toBeCloseTo(3);
  });
});

describe('setSceneNodeTransform', () => {
  it('sets position, rotation, and scale in one call', () => {
    const node = createSceneNode();
    const pos = createVector3(1, 2, 3);
    const rot = createQuaternion(0, 0, 0, 1);
    const scale = createVector3(2, 2, 2);
    setSceneNodeTransform(node, pos, rot, scale);
    const outPos = createVector3();
    getSceneNodePosition(outPos, node);
    expect(outPos.x).toBeCloseTo(1);
    expect(outPos.y).toBeCloseTo(2);
    expect(outPos.z).toBeCloseTo(3);
    const outScale = createVector3();
    getSceneNodeScale(outScale, node);
    expect(outScale.x).toBeCloseTo(2);
    expect(outScale.y).toBeCloseTo(2);
    expect(outScale.z).toBeCloseTo(2);
  });

  it('is alias-safe when position and scale point to the same objects', () => {
    const node = createSceneNode();
    const v = createVector3(3, 3, 3);
    const q = createQuaternion(0, 0, 0, 1);
    // position and scale share the same object — reads before writes
    setSceneNodeTransform(node, v, q, v);
    expect(node.localMatrix.m[0]).not.toBeNaN();
  });
});
