import { sampleAnimationTrack } from '@flighthq/animation/contract';
import { createDisplayObject } from '@flighthq/scene2d/contract';
import type { DisplayObject, RiveCoreObject } from '@flighthq/types/contract';
import { RiveFieldType } from '@flighthq/types/contract';

import { createRiveAnimationClips } from './riveAnimation';

// Time comes from the animation's OWN frame rate, and the interpolation enum was read off the corpus
// rather than a header: type 2 carries an interpolator in 18,044 of 18,608 cases, type 1 never does,
// type 0 almost never — hold, linear, cubic. Expectations below are computed from the frame/fps
// relation the format states, not from what the builder produced.

const LINEAR_ANIMATION = 31;
const KEYED_OBJECT = 25;
const KEYED_PROPERTY = 26;
const KEYFRAME_DOUBLE = 30;
const CUBIC_INTERPOLATOR = 139;

const NAME = 55;
const FPS = 56;
const DURATION = 57;
const OBJECT_ID = 51;
const PROPERTY_KEY = 53;
const FRAME = 67;
const INTERPOLATION = 68;
const INTERPOLATOR_ID = 69;
const VALUE = 70;

describe('createRiveAnimationClips', () => {
  it('returns nothing when the range holds no animation', () => {
    expect(createRiveAnimationClips([object(KEYED_OBJECT, {})], { end: 1, start: 0 }, [])).toEqual([]);
  });

  it('names each clip and takes its duration from its own frame rate', () => {
    const objects = [
      object(LINEAR_ANIMATION, { [FPS]: 30, [DURATION]: 60 }, 'walk'),
      object(LINEAR_ANIMATION, { [FPS]: 24, [DURATION]: 12 }, 'blink'),
    ];
    const clips = createRiveAnimationClips(objects, { end: 2, start: 0 }, []);

    expect(clips.map((entry) => entry.name)).toEqual(['walk', 'blink']);
    expect(clips[0].clip.duration).toBeCloseTo(2, 6);
    expect(clips[1].clip.duration).toBeCloseTo(0.5, 6);
  });

  it('places keyframes at frame over fps seconds', () => {
    const { clips } = build(30, 13, [
      { frame: 0, value: 10 },
      { frame: 15, value: 20 },
      { frame: 30, value: 40 },
    ]);
    const track = clips[0].clip.channels[0].track;

    expect(Array.from(track.times)).toEqual([0, 0.5, 1]);
    expect(Array.from(track.values)).toEqual([10, 20, 40]);
  });

  it('binds each keyed property to the node the keyed object names', () => {
    const node = createDisplayObject({ name: 'target' });
    const { clips } = build(30, 13, [{ frame: 0, value: 5 }], [null, node], 1);
    const target = clips[0].clip.channels[0].targetRef as { node: DisplayObject; path: string };

    expect(target.node).toBe(node);
    expect(target.path).toBe('X');
  });

  it('maps the transform properties it can bind and skips the rest', () => {
    const cases = [
      [13, 'X'],
      [9, 'X'],
      [14, 'Y'],
      [10, 'Y'],
      [15, 'Rotation'],
      [16, 'ScaleX'],
      [17, 'ScaleY'],
      [18, 'Alpha'],
    ] as const;
    for (const [key, path] of cases) {
      const { clips } = build(30, key, [{ frame: 0, value: 1 }]);
      expect((clips[0].clip.channels[0].targetRef as { path: string }).path).toBe(path);
    }

    // A vertex position animates geometry rather than a node property, so it binds to nothing yet.
    const { clips } = build(30, 24, [{ frame: 0, value: 1 }]);
    expect(clips[0].clip.channels).toHaveLength(0);
  });

  it('converts an animated rotation from radians into degrees', () => {
    const { clips } = build(30, 15, [
      { frame: 0, value: 0 },
      { frame: 30, value: Math.PI },
    ]);

    expect(Array.from(clips[0].clip.channels[0].track.values)[1]).toBeCloseTo(180, 6);
  });

  it('holds a value across a hold segment and interpolates across a linear one', () => {
    const held = build(30, 13, [
      { frame: 0, interpolation: 0, value: 0 },
      { frame: 30, interpolation: 0, value: 100 },
    ]);
    const linear = build(30, 13, [
      { frame: 0, interpolation: 1, value: 0 },
      { frame: 30, interpolation: 1, value: 100 },
    ]);
    const out = [0];

    sampleAnimationTrack(out, held.clips[0].clip.channels[0].track, 0.5);
    expect(out[0]).toBe(0);
    sampleAnimationTrack(out, linear.clips[0].clip.channels[0].track, 0.5);
    expect(out[0]).toBeCloseTo(50, 6);
  });

  // A cubic keyframe names an interpolator, and the interpolator's own curve is what bends the
  // segment. A strongly biased curve must not sample as the linear midpoint.
  it('applies the cubic interpolator a keyframe names', () => {
    const objects: RiveCoreObject[] = [
      object(LINEAR_ANIMATION, { [FPS]: 30, [DURATION]: 30 }),
      object(CUBIC_INTERPOLATOR, { 63: 0.9, 64: 0, 65: 1, 66: 0.1 }),
      object(KEYED_OBJECT, { [OBJECT_ID]: 0 }),
      object(KEYED_PROPERTY, { [PROPERTY_KEY]: 13 }),
      object(KEYFRAME_DOUBLE, { [FRAME]: 0, [VALUE]: 0, [INTERPOLATION]: 2, [INTERPOLATOR_ID]: 1 }),
      object(KEYFRAME_DOUBLE, { [FRAME]: 30, [VALUE]: 100, [INTERPOLATION]: 2, [INTERPOLATOR_ID]: 1 }),
    ];
    const node = createDisplayObject();
    const clips = createRiveAnimationClips(objects, { end: objects.length, start: 0 }, [node]);
    const out = [0];

    sampleAnimationTrack(out, clips[0].clip.channels[0].track, 0.5);
    expect(out[0]).toBeGreaterThan(0);
    expect(out[0]).toBeLessThan(40);
  });

  it('drops a repeated frame rather than giving the track two samples at one time', () => {
    const { clips } = build(30, 13, [
      { frame: 0, value: 0 },
      { frame: 0, value: 99 },
      { frame: 30, value: 100 },
    ]);

    expect(Array.from(clips[0].clip.channels[0].track.times)).toEqual([0, 1]);
    expect(Array.from(clips[0].clip.channels[0].track.values)).toEqual([0, 100]);
  });

  it('ignores a keyed object naming a node that does not exist', () => {
    const { clips } = build(30, 13, [{ frame: 0, value: 1 }], [], 5);

    expect(clips[0].clip.channels).toHaveLength(0);
  });
});

function build(
  fps: number,
  propertyKey: number,
  frames: ReadonlyArray<{ frame: number; interpolation?: number; value: number }>,
  nodes?: Array<DisplayObject | null>,
  objectId = 0,
) {
  const objects: RiveCoreObject[] = [
    object(LINEAR_ANIMATION, { [FPS]: fps, [DURATION]: 60 }),
    object(KEYED_OBJECT, { [OBJECT_ID]: objectId }),
    object(KEYED_PROPERTY, { [PROPERTY_KEY]: propertyKey }),
    ...frames.map((entry) =>
      object(KEYFRAME_DOUBLE, {
        [FRAME]: entry.frame,
        [INTERPOLATION]: entry.interpolation ?? 1,
        [VALUE]: entry.value,
      }),
    ),
  ];
  const resolved = nodes ?? [createDisplayObject()];
  return { clips: createRiveAnimationClips(objects, { end: objects.length, start: 0 }, resolved) };
}

function object(typeKey: number, properties: Readonly<Record<number, number>>, name?: string): RiveCoreObject {
  const entries: RiveCoreObject['properties'] = Object.entries(properties).map(([key, value]) => ({
    key: Number(key),
    type: RiveFieldType.Double,
    value,
  }));
  if (name !== undefined) entries.push({ key: NAME, type: RiveFieldType.String, value: name });
  return { properties: entries, typeKey };
}
