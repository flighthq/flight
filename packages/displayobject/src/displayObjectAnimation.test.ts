import { createAnimationChannel, createAnimationClip, createAnimationTrack } from '@flighthq/animation';
import { getNodeLocalTransformRevision } from '@flighthq/node';
import type { DisplayObjectAnimationPath, DisplayObjectAnimationTarget } from '@flighthq/types';

import { createDisplayObject } from './displayObject';
import { applyAnimationClipToDisplayObject } from './displayObjectAnimation';

describe('applyAnimationClipToDisplayObject', () => {
  it.each([
    { expected: { x: 5, y: 10 }, path: 'Position', values: [0, 0, 10, 20] },
    { expected: { pivotX: 5, pivotY: 10 }, path: 'Pivot', values: [0, 0, 10, 20] },
    { expected: { scaleX: 2, scaleY: 3 }, path: 'Scale', values: [1, 1, 3, 5] },
    { expected: { skewX: 0.25, skewY: 0.5 }, path: 'Skew', values: [0, 0, 0.5, 1] },
  ] as const)('applies the $path vector path and invalidates transform', ({ expected, path, values }) => {
    const node = createDisplayObject();
    const before = getNodeLocalTransformRevision(node);
    const clip = createBoundClip(node, path, 2, values);

    applyAnimationClipToDisplayObject(clip, 0.5);

    expect(node).toMatchObject(expected);
    expect(getNodeLocalTransformRevision(node)).toBeGreaterThan(before);
  });

  it('applies scalar rotation, alpha, and visibility channels', () => {
    const node = createDisplayObject();
    const clip = createAnimationClip([
      createAnimationChannel(createAnimationTrack({ times: [0, 1], values: [0, 2] }), {
        node,
        path: 'Rotation',
      } satisfies DisplayObjectAnimationTarget),
      createAnimationChannel(createAnimationTrack({ times: [0, 1], values: [1, 0.5] }), {
        node,
        path: 'Alpha',
      } satisfies DisplayObjectAnimationTarget),
      createAnimationChannel(createAnimationTrack({ interpolation: 'Step', times: [0, 1], values: [0, 1] }), {
        node,
        path: 'Visible',
      } satisfies DisplayObjectAnimationTarget),
    ]);

    applyAnimationClipToDisplayObject(clip, 0.5);

    expect(node.rotation).toBe(1);
    expect(node.alpha).toBe(0.75);
    expect(node.visible).toBe(false);
  });

  it('ignores foreign target refs', () => {
    const clip = createAnimationClip([
      createAnimationChannel(createAnimationTrack({ times: [0, 1], values: [0, 1] }), {}),
    ]);
    expect(() => applyAnimationClipToDisplayObject(clip, 0.5)).not.toThrow();
  });
});

function createBoundClip(
  node: ReturnType<typeof createDisplayObject>,
  path: DisplayObjectAnimationPath,
  components: number,
  values: ReadonlyArray<number>,
) {
  return createAnimationClip([
    createAnimationChannel(createAnimationTrack({ components, times: [0, 1], values }), {
      node,
      path,
    } satisfies DisplayObjectAnimationTarget),
  ]);
}
