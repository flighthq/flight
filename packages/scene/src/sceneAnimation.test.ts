import { createAnimationChannel, createAnimationClip, createAnimationTrack } from '@flighthq/animation';
import { createQuaternion, createVector3 } from '@flighthq/geometry';
import { createBoxMeshGeometry } from '@flighthq/mesh';
import type { MeshMorph } from '@flighthq/types';
import {
  SceneAnimationPathRotation,
  SceneAnimationPathScale,
  SceneAnimationPathTranslation,
  SceneAnimationPathWeights,
} from '@flighthq/types';

import { createMesh } from './mesh';
import { applyAnimationClipToScene } from './sceneAnimation';
import { createSceneNode } from './sceneNode';
import { getSceneNodePosition, getSceneNodeRotationQuaternion, getSceneNodeScale } from './sceneNodeTransform';

describe('applyAnimationClipToScene', () => {
  it('drives a node translation from a Vector3 channel', () => {
    const node = createSceneNode();
    const track = createAnimationTrack({ components: 3, times: [0, 1], values: [0, 0, 0, 10, 20, 30] });
    const clip = createAnimationClip([createAnimationChannel(track, { node, path: SceneAnimationPathTranslation })]);

    applyAnimationClipToScene(clip, 0.5);

    const out = createVector3();
    getSceneNodePosition(out, node);
    expect(out.x).toBeCloseTo(5);
    expect(out.y).toBeCloseTo(10);
    expect(out.z).toBeCloseTo(15);
  });

  it('drives a node rotation from a quaternion channel', () => {
    const node = createSceneNode();
    const s = Math.sin(Math.PI / 4);
    const c = Math.cos(Math.PI / 4);
    const track = createAnimationTrack({
      components: 4,
      times: [0, 1],
      values: [0, 0, 0, 1, 0, 0, s, c],
    });
    const clip = createAnimationClip([createAnimationChannel(track, { node, path: SceneAnimationPathRotation })]);

    applyAnimationClipToScene(clip, 1);

    const out = createQuaternion();
    getSceneNodeRotationQuaternion(out, node);
    expect(out.x).toBeCloseTo(0);
    expect(out.y).toBeCloseTo(0);
    expect(out.z).toBeCloseTo(s);
    expect(out.w).toBeCloseTo(c);
  });

  it('drives a node scale', () => {
    const node = createSceneNode();
    const track = createAnimationTrack({ components: 3, times: [0, 1], values: [1, 1, 1, 3, 3, 3] });
    const clip = createAnimationClip([createAnimationChannel(track, { node, path: SceneAnimationPathScale })]);

    applyAnimationClipToScene(clip, 1);

    const out = createVector3();
    getSceneNodeScale(out, node);
    expect(out.x).toBeCloseTo(3);
    expect(out.y).toBeCloseTo(3);
    expect(out.z).toBeCloseTo(3);
  });

  it('drives a mesh morph weight array from a Weights channel', () => {
    const morph: MeshMorph = {
      targets: [
        { normalDeltas: null, positionDeltas: new Float32Array(0), tangentDeltas: null },
        { normalDeltas: null, positionDeltas: new Float32Array(0), tangentDeltas: null },
      ],
      weights: new Float32Array([0, 0]),
    };
    const mesh = createMesh(createBoxMeshGeometry(), []);
    mesh.morph = morph;
    // A 2-wide weights track: at t=0.5 it interpolates halfway between [0,0] and [1,0.5].
    const track = createAnimationTrack({ components: 2, times: [0, 1], values: [0, 0, 1, 0.5] });
    const clip = createAnimationClip([createAnimationChannel(track, { node: mesh, path: SceneAnimationPathWeights })]);

    applyAnimationClipToScene(clip, 0.5);

    expect(morph.weights[0]).toBeCloseTo(0.5);
    expect(morph.weights[1]).toBeCloseTo(0.25);
  });

  it('skips a Weights channel whose target mesh carries no morph', () => {
    const mesh = createMesh(createBoxMeshGeometry(), []);
    const track = createAnimationTrack({ components: 1, times: [0, 1], values: [0, 1] });
    const clip = createAnimationClip([createAnimationChannel(track, { node: mesh, path: SceneAnimationPathWeights })]);
    // No morph on the mesh — the channel is skipped without throwing.
    expect(() => applyAnimationClipToScene(clip, 1)).not.toThrow();
  });

  it('skips channels whose targetRef is not a scene target', () => {
    const node = createSceneNode();
    const track = createAnimationTrack({ components: 3, times: [0, 1], values: [0, 0, 0, 9, 9, 9] });
    const clip = createAnimationClip([createAnimationChannel(track, null)]);

    applyAnimationClipToScene(clip, 1);

    const out = createVector3();
    getSceneNodePosition(out, node);
    expect(out.x).toBe(0);
  });
});
