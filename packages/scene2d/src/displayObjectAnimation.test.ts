import { createAnimationChannel, createAnimationClip, createAnimationTrack } from '@flighthq/animation';
import { getNodeLocalTransformRevision } from '@flighthq/node';
import type { Node2DAnimationPath, Node2DAnimationTarget } from '@flighthq/types';

import { createDisplayObject } from './displayObject';
import { applyAnimationClipToNode2D } from './displayObjectAnimation';

describe('applyAnimationClipToNode2D', () => {
  it.each([
    { expected: { x: 5, y: 10 }, path: 'Position', values: [0, 0, 10, 20] },
    { expected: { pivotX: 5, pivotY: 10 }, path: 'Pivot', values: [0, 0, 10, 20] },
    { expected: { scaleX: 2, scaleY: 3 }, path: 'Scale', values: [1, 1, 3, 5] },
    { expected: { skewX: 0.25, skewY: 0.5 }, path: 'Skew', values: [0, 0, 0.5, 1] },
  ] as const)('applies the $path vector path and invalidates transform', ({ expected, path, values }) => {
    const node = createDisplayObject();
    const before = getNodeLocalTransformRevision(node);
    const clip = createBoundClip(node, path, 2, values);

    applyAnimationClipToNode2D(clip, 0.5);

    expect(node).toMatchObject(expected);
    expect(getNodeLocalTransformRevision(node)).toBeGreaterThan(before);
  });

  it('applies scalar rotation, alpha, and visibility channels', () => {
    const node = createDisplayObject();
    const clip = createAnimationClip([
      createAnimationChannel(createAnimationTrack({ times: [0, 1], values: [0, 2] }), {
        node,
        path: 'Rotation',
      } satisfies Node2DAnimationTarget),
      createAnimationChannel(createAnimationTrack({ times: [0, 1], values: [1, 0.5] }), {
        node,
        path: 'Alpha',
      } satisfies Node2DAnimationTarget),
      createAnimationChannel(createAnimationTrack({ interpolation: 'Step', times: [0, 1], values: [0, 1] }), {
        node,
        path: 'Visible',
      } satisfies Node2DAnimationTarget),
    ]);

    applyAnimationClipToNode2D(clip, 0.5);

    expect(node.rotation).toBe(1);
    expect(node.alpha).toBe(0.75);
    expect(node.visible).toBe(false);
  });

  it('ignores foreign target refs', () => {
    const clip = createAnimationClip([
      createAnimationChannel(createAnimationTrack({ times: [0, 1], values: [0, 1] }), {}),
    ]);
    expect(() => applyAnimationClipToNode2D(clip, 0.5)).not.toThrow();
  });
});

function createBoundClip(
  node: ReturnType<typeof createDisplayObject>,
  path: Node2DAnimationPath,
  components: number,
  values: ReadonlyArray<number>,
) {
  return createAnimationClip([
    createAnimationChannel(createAnimationTrack({ components, times: [0, 1], values }), {
      node,
      path,
    } satisfies Node2DAnimationTarget),
  ]);
}
