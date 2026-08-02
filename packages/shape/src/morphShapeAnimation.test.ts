import {
  createAnimationBlendTree,
  createAnimationBlendTreeInput,
  createAnimationChannel,
  createAnimationClip,
  createAnimationPlayer,
  createAnimationTrack,
  sampleAnimationBlendTree,
} from '@flighthq/animation/contract';
import { getNodeLocalContentRevision } from '@flighthq/node/contract';
import { appendPathLineTo, appendPathMoveTo, createPath, createPathMorph } from '@flighthq/path/contract';
import type { MorphShape, MorphShapeAnimationTarget } from '@flighthq/types/contract';

import { createMorphShape } from './morphShape';
import {
  applyAnimationClipToMorphShape,
  applyMorphShapeAnimationSample,
  createMorphShapeAnimationTarget,
} from './morphShapeAnimation';

describe('applyAnimationClipToMorphShape', () => {
  it('samples scalar progress while preserving easing overshoot', () => {
    const shape = createTestMorphShape();
    const target = createMorphShapeAnimationTarget(shape);
    const clip = createAnimationClip([
      createAnimationChannel(
        createAnimationTrack({ easing: (progress) => progress * 2, times: [0, 1], values: [0, 1] }),
        target,
      ),
    ]);

    applyAnimationClipToMorphShape(clip, 0.75);

    expect(shape.data.progress).toBe(1.5);
    expect(shape.data.path.data.slice(0, 2)).toStrictEqual([30, 45]);
  });

  it('ignores foreign channels in a composed clip', () => {
    const shape = createTestMorphShape();
    const clip = createAnimationClip([
      createAnimationChannel(createAnimationTrack({ times: [0, 1], values: [0, 100] }), { node: shape, path: 'X' }),
      createAnimationChannel(
        createAnimationTrack({ times: [0, 1], values: [0, 1] }),
        createMorphShapeAnimationTarget(shape),
      ),
    ]);

    applyAnimationClipToMorphShape(clip, 0.25);

    expect(shape.x).toBe(0);
    expect(shape.data.progress).toBe(0.25);
  });
});

describe('applyMorphShapeAnimationSample', () => {
  it('mutates stable path buffers and invalidates retained content', () => {
    const shape = createTestMorphShape();
    const commands = shape.data.path.commands;
    const data = shape.data.path.data;
    const revision = getNodeLocalContentRevision(shape);
    const channel = createAnimationChannel(
      createAnimationTrack({ times: [0, 1], values: [0, 1] }),
      createMorphShapeAnimationTarget(shape),
    );

    expect(applyMorphShapeAnimationSample([0.5], channel)).toBe(true);
    expect(shape.data.progress).toBe(0.5);
    expect(shape.data.path.commands).toBe(commands);
    expect(shape.data.path.data).toBe(data);
    expect(getNodeLocalContentRevision(shape)).toBe(revision + 1);
  });

  it('serves as the sink for composed animation samples', () => {
    const shape = createTestMorphShape();
    const target = createMorphShapeAnimationTarget(shape);
    const a = createAnimationPlayer(
      createAnimationClip([createAnimationChannel(createAnimationTrack({ times: [0, 1], values: [0, 1] }), target)]),
      { time: 0.5 },
    );
    const b = createAnimationPlayer(
      createAnimationClip([createAnimationChannel(createAnimationTrack({ times: [0, 1], values: [0, 0.2] }), target)]),
      { time: 0.5 },
    );
    const tree = createAnimationBlendTree([createAnimationBlendTreeInput(a, 1), createAnimationBlendTreeInput(b, 1)]);

    sampleAnimationBlendTree([0], tree, applyMorphShapeAnimationSample);

    expect(shape.data.progress).toBeCloseTo(0.3);
  });

  it('returns false for foreign targets without changing the shape', () => {
    const shape = createTestMorphShape();
    const channel = createAnimationChannel(createAnimationTrack({ times: [0, 1], values: [0, 1] }), {
      shape: { kind: 'acme.NotMorphShape' },
    });

    expect(applyMorphShapeAnimationSample([1], channel)).toBe(false);
    expect(shape.data.progress).toBe(0);
  });
});

describe('createMorphShapeAnimationTarget', () => {
  it('allocates a reusable target descriptor for one MorphShape', () => {
    const shape = createTestMorphShape();

    const target: MorphShapeAnimationTarget = createMorphShapeAnimationTarget(shape);

    expect(target).toStrictEqual({ shape });
  });
});

function createTestMorphShape(): MorphShape {
  const start = createPath();
  appendPathMoveTo(start, 0, 0);
  appendPathLineTo(start, 10, 0);
  const end = createPath();
  appendPathMoveTo(end, 20, 30);
  appendPathLineTo(end, 40, 30);
  return createMorphShape(createPathMorph(start, end)!);
}
