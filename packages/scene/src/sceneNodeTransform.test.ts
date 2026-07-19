import { createVector3 } from '@flighthq/geometry';
import { getNodeLocalMatrix4 } from '@flighthq/node';

import { createSceneNode } from './sceneNode';
import { setSceneNodeLookAt } from './sceneNodeTransform';

describe('setSceneNodeLookAt', () => {
  it('places the node at the eye position', () => {
    const node = createSceneNode();
    const eye = createVector3(3, 4, 5);
    const target = createVector3(0, 0, 0);
    const up = createVector3(0, 1, 0);
    setSceneNodeLookAt(node, eye, target, up);
    // Model-matrix translation column = eye.
    const m = getNodeLocalMatrix4(node).m;
    expect(m[12]).toBeCloseTo(3);
    expect(m[13]).toBeCloseTo(4);
    expect(m[14]).toBeCloseTo(5);
  });

  it('Z-axis column points from target back to eye (RH -Z-forward convention)', () => {
    const node = createSceneNode();
    setSceneNodeLookAt(node, createVector3(0, 0, 5), createVector3(0, 0, 0), createVector3(0, 1, 0));
    // normalize(eye - target) = (0,0,1) → m[8]=0, m[9]=0, m[10]=1
    const m = getNodeLocalMatrix4(node).m;
    expect(m[8]).toBeCloseTo(0);
    expect(m[9]).toBeCloseTo(0);
    expect(m[10]).toBeCloseTo(1);
  });

  it('preserves w = 1 and last column padding', () => {
    const node = createSceneNode();
    setSceneNodeLookAt(node, createVector3(1, 2, 3), createVector3(0, 0, 0), createVector3(0, 1, 0));
    const m = getNodeLocalMatrix4(node).m;
    expect(m[3]).toBe(0);
    expect(m[7]).toBe(0);
    expect(m[11]).toBe(0);
    expect(m[15]).toBe(1);
  });
});
