import { createVector3 } from '@flighthq/geometry/contract';
import { getNodeLocalMatrix4 } from '@flighthq/node/contract';

import { createNode3D } from './sceneNode';
import { setNode3DLookAt } from './sceneNodeTransform';

describe('setNode3DLookAt', () => {
  it('places the node at the eye position', () => {
    const node = createNode3D();
    const eye = createVector3(3, 4, 5);
    const target = createVector3(0, 0, 0);
    const up = createVector3(0, 1, 0);
    setNode3DLookAt(node, eye, target, up);
    // Model-matrix translation column = eye.
    const m = getNodeLocalMatrix4(node).m;
    expect(m[12]).toBeCloseTo(3);
    expect(m[13]).toBeCloseTo(4);
    expect(m[14]).toBeCloseTo(5);
  });

  it('Z-axis column points from target back to eye (RH -Z-forward convention)', () => {
    const node = createNode3D();
    setNode3DLookAt(node, createVector3(0, 0, 5), createVector3(0, 0, 0), createVector3(0, 1, 0));
    // normalize(eye - target) = (0,0,1) → m[8]=0, m[9]=0, m[10]=1
    const m = getNodeLocalMatrix4(node).m;
    expect(m[8]).toBeCloseTo(0);
    expect(m[9]).toBeCloseTo(0);
    expect(m[10]).toBeCloseTo(1);
  });

  it('preserves w = 1 and last column padding', () => {
    const node = createNode3D();
    setNode3DLookAt(node, createVector3(1, 2, 3), createVector3(0, 0, 0), createVector3(0, 1, 0));
    const m = getNodeLocalMatrix4(node).m;
    expect(m[3]).toBe(0);
    expect(m[7]).toBe(0);
    expect(m[11]).toBe(0);
    expect(m[15]).toBe(1);
  });
});
