import { sampleAnimationTrack } from '@flighthq/animation/contract';
import { getNodeChildAt, getNodeChildCount } from '@flighthq/node/contract';
import { createDisplayObject } from '@flighthq/scene2d/contract';
import type { DisplayObject, Node2D, RiveArtboardGraph, RiveCoreObject, Shape } from '@flighthq/types/contract';
import { RiveFieldType, ShapeKind } from '@flighthq/types/contract';

import { applyAnimationClipToRiveDocument, createRiveAnimationClips } from './riveAnimation';
import { createScene2DFromRiveDocument } from './riveScene2D';

// Time comes from the animation's OWN frame rate, and the interpolation enum was read off the corpus
// rather than a header: type 2 carries an interpolator in 18,044 of 18,608 cases, type 1 never does,
// type 0 almost never — hold, linear, cubic. Expectations below are computed from the frame/fps
// relation the format states, not from what the builder produced.

const LINEAR_ANIMATION = 31;
const KEYED_OBJECT = 25;
const KEYED_PROPERTY = 26;
const KEYFRAME_DOUBLE = 30;
const CUBIC_INTERPOLATOR = 139;
const KEYFRAME_BOOL = 84;

const NAME = 55;
const FPS = 56;
const DURATION = 57;
const SPEED = 58;
const LOOP = 59;
const WORK_START = 60;
const WORK_END = 61;
const ENABLE_WORK_AREA = 62;
const OBJECT_ID = 51;
const PROPERTY_KEY = 53;
const FRAME = 67;
const INTERPOLATION = 68;
const INTERPOLATOR_ID = 69;
const VALUE = 70;

// Geometry and paint animate by writing the value back onto the core object the file keyed and
// rebuilding the owning shape, so the ordinary readers produce the result and there is no second
// code path to keep in step. Before this, 145 of the corpus's 383 clips carried no channels at all.
describe('applyAnimationClipToRiveDocument', () => {
  it.each([
    { expected: 20, field: 'x', from: 10, propertyKey: 13, to: 30 },
    { expected: 20, field: 'x', from: 10, propertyKey: 9, to: 30 },
    { expected: 20, field: 'y', from: 10, propertyKey: 14, to: 30 },
    { expected: 20, field: 'y', from: 10, propertyKey: 10, to: 30 },
    { expected: 90, field: 'rotation', from: 0, propertyKey: 15, to: Math.PI },
    { expected: 2, field: 'scaleX', from: 1, propertyKey: 16, to: 3 },
    { expected: 2, field: 'scaleY', from: 1, propertyKey: 17, to: 3 },
    { expected: 0.75, field: 'alpha', from: 1, propertyKey: 18, to: 0.5 },
  ] as const)('composes $field with geometry and paint mutation', ({ expected, field, from, propertyKey, to }) => {
    const result = createScene2DFromRiveDocument(riveWithComposedAnimation(propertyKey, from, to));
    const shape = firstShape(result);

    applyAnimationClipToRiveDocument(result.artboards[0].animations[0].clip, 0.5);

    expect(shape[field]).toBeCloseTo(expected, 3);
    expect(pathPoints(shape)[0][0]).toBeCloseTo(30, 3);
    expect(fillPaint(shape).color).toBe(0x304050);
    expect(fillPaint(shape).alpha).toBeCloseTo(0x80 / 0xff, 6);
  });

  it('moves a path vertex and regenerates the shape geometry', () => {
    const result = createScene2DFromRiveDocument(riveWithAnimatedVertex(24, 0, 60));
    const shape = firstShape(result);

    applyAnimationClipToRiveDocument(result.artboards[0].animations[0].clip, 1);

    expect(pathPoints(shape)[0][0]).toBeCloseTo(60, 3);
  });

  it('interpolates a vertex partway through its segment', () => {
    const result = createScene2DFromRiveDocument(riveWithAnimatedVertex(24, 0, 100));
    const shape = firstShape(result);

    applyAnimationClipToRiveDocument(result.artboards[0].animations[0].clip, 0.5);

    expect(pathPoints(shape)[0][0]).toBeCloseTo(50, 3);
  });

  it('animates a fill colour through the same route', () => {
    const result = createScene2DFromRiveDocument(riveWithAnimatedFill());
    const shape = firstShape(result);

    applyAnimationClipToRiveDocument(result.artboards[0].animations[0].clip, 1);

    expect(fillPaint(shape)).toEqual({ alpha: 1, color: 0xddeeff });
  });

  it('interpolates packed ARGB by channel instead of treating it as one scalar', () => {
    const result = createScene2DFromRiveDocument(riveWithAnimatedFill(0x40102030, 0xc0506070));
    const shape = firstShape(result);

    applyAnimationClipToRiveDocument(result.artboards[0].animations[0].clip, 0.5);

    expect(fillPaint(shape).color).toBe(0x304050);
    expect(fillPaint(shape).alpha).toBeCloseTo(0x80 / 0xff, 6);
  });

  it('leaves the clip alone when nothing keyed belongs to a shape', () => {
    const result = createScene2DFromRiveDocument(riveWithAnimatedVertex(24, 0, 10));

    // Sampling twice must be stable rather than accumulating.
    applyAnimationClipToRiveDocument(result.artboards[0].animations[0].clip, 1);
    const once = JSON.stringify(firstShape(result).data.commands);
    applyAnimationClipToRiveDocument(result.artboards[0].animations[0].clip, 1);

    expect(JSON.stringify(firstShape(result).data.commands)).toBe(once);
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
  return {
    clips: createRiveAnimationClips(objects, { end: objects.length, start: 0 }, resolved, emptyArtboard(), new Map()),
  };
}

// These cases exercise the transform channels, which need no artboard or rebuild registry.
function emptyArtboard(): RiveArtboardGraph {
  return { objects: [], parentIndices: [], streamEnd: 0, streamStart: 0 };
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

describe('createRiveAnimationClips', () => {
  it('returns nothing when the range holds no animation', () => {
    expect(
      createRiveAnimationClips([object(KEYED_OBJECT, {})], { end: 1, start: 0 }, [], emptyArtboard(), new Map()),
    ).toEqual([]);
  });

  it('names each clip and takes its duration from its own frame rate', () => {
    const objects = [
      object(LINEAR_ANIMATION, { [FPS]: 30, [DURATION]: 60 }, 'walk'),
      object(LINEAR_ANIMATION, { [FPS]: 24, [DURATION]: 12 }, 'blink'),
    ];
    const clips = createRiveAnimationClips(objects, { end: 2, start: 0 }, [], emptyArtboard(), new Map());

    expect(clips.map((entry) => entry.name)).toEqual(['walk', 'blink']);
    expect(clips[0].clip.duration).toBeCloseTo(2, 6);
    expect(clips[1].clip.duration).toBeCloseTo(0.5, 6);
  });

  // Loop, speed and the work area are stated by the animation and reported rather than applied: an
  // AnimationClip has no notion of repetition, rate, or a trimmed range, so folding them into sampled
  // data would bake a playback policy into the keyframes.
  it('carries the loop mode the animation states', () => {
    const modes = [0, 1, 2].map(
      (value) =>
        createRiveAnimationClips(
          [object(LINEAR_ANIMATION, { [FPS]: 30, [LOOP]: value })],
          { end: 1, start: 0 },
          [],
          emptyArtboard(),
          new Map(),
        )[0].loop,
    );

    expect(modes).toEqual(['OneShot', 'Loop', 'PingPong']);
  });

  it('falls back to one shot for a loop mode this reader does not know', () => {
    const clips = createRiveAnimationClips(
      [object(LINEAR_ANIMATION, { [FPS]: 30, [LOOP]: 99 })],
      { end: 1, start: 0 },
      [],
      emptyArtboard(),
      new Map(),
    );

    expect(clips[0].loop).toBe('OneShot');
  });

  it('carries playback speed, defaulting to authored speed', () => {
    const stated = createRiveAnimationClips(
      [object(LINEAR_ANIMATION, { [FPS]: 30, [SPEED]: 2.5 })],
      { end: 1, start: 0 },
      [],
      emptyArtboard(),
      new Map(),
    );
    const absent = createRiveAnimationClips(
      [object(LINEAR_ANIMATION, { [FPS]: 30 })],
      { end: 1, start: 0 },
      [],
      emptyArtboard(),
      new Map(),
    );

    expect(stated[0].speed).toBe(2.5);
    expect(absent[0].speed).toBe(1);
  });

  it('reports the work area in seconds only when the animation enables it', () => {
    const enabled = createRiveAnimationClips(
      [object(LINEAR_ANIMATION, { [FPS]: 30, [ENABLE_WORK_AREA]: 1, [WORK_START]: 15, [WORK_END]: 60 })],
      { end: 1, start: 0 },
      [],
      emptyArtboard(),
      new Map(),
    );
    // The same bounds with the flag clear are authored data the animation does not apply.
    const disabled = createRiveAnimationClips(
      [object(LINEAR_ANIMATION, { [FPS]: 30, [WORK_START]: 15, [WORK_END]: 60 })],
      { end: 1, start: 0 },
      [],
      emptyArtboard(),
      new Map(),
    );

    expect(enabled[0].workAreaStart).toBeCloseTo(0.5, 6);
    expect(enabled[0].workAreaEnd).toBeCloseTo(2, 6);
    expect(disabled[0].workAreaStart).toBeNull();
    expect(disabled[0].workAreaEnd).toBeNull();
  });

  it('leaves an unset work-area bound absent rather than reading it as frame zero', () => {
    // The format's unset sentinel is -1, and 0 is a real frame, so the two cannot share a spelling.
    const clips = createRiveAnimationClips(
      [object(LINEAR_ANIMATION, { [FPS]: 30, [ENABLE_WORK_AREA]: 1, [WORK_END]: 60 })],
      { end: 1, start: 0 },
      [],
      emptyArtboard(),
      new Map(),
    );

    expect(clips[0].workAreaStart).toBeNull();
    expect(clips[0].workAreaEnd).toBeCloseTo(2, 6);
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

  it('maps the shared transform properties and requires an owning shape for mutable content', () => {
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

    // A vertex position needs the graph and rebuild registry supplied by the full importer; this
    // target-only fixture deliberately has neither, so it cannot manufacture a content channel.
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
    const clips = createRiveAnimationClips(
      objects,
      { end: objects.length, start: 0 },
      [node],
      emptyArtboard(),
      new Map(),
    );
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

  it('does not read another keyframe kind through the double value field', () => {
    const artboard: RiveArtboardGraph = {
      objects: [object(1, {}), object(3, {})],
      parentIndices: [-1, 0],
      streamEnd: 0,
      streamStart: 0,
    };
    const objects = [
      object(LINEAR_ANIMATION, { [FPS]: 30, [DURATION]: 30 }),
      object(KEYED_OBJECT, { [OBJECT_ID]: 1 }),
      object(KEYED_PROPERTY, { [PROPERTY_KEY]: 41 }),
      object(KEYFRAME_BOOL, { [FRAME]: 0, [VALUE]: 1 }),
    ];
    const clips = createRiveAnimationClips(
      objects,
      { end: objects.length, start: 0 },
      [null, createDisplayObject()],
      artboard,
      new Map([[1, () => undefined]]),
    );

    expect(clips[0].clip.channels).toHaveLength(0);
  });
});

function firstShape(result: ReturnType<typeof createScene2DFromRiveDocument>): Shape {
  return findShape(result.artboards[0].root)!;
}

function findShape(node: Node2D): Shape | null {
  if (node.kind === ShapeKind) return node as Shape;
  for (let index = 0; index < getNodeChildCount(node); index++) {
    const found = findShape(getNodeChildAt(node, index) as Node2D);
    if (found !== null) return found;
  }
  return null;
}

function pathPoints(shape: Shape): number[][] {
  const tokens = shape.data.commands as unknown[];
  const points: number[][] = [];
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i] !== 'drawPath') continue;
    const data = tokens[i + 3] as number[];
    for (let o = 0; o + 1 < data.length; o += 2) points.push([data[o], data[o + 1]]);
  }
  return points;
}

function fillPaint(shape: Shape): { alpha: number; color: number } {
  const tokens = shape.data.commands as unknown[];
  const at = tokens.indexOf('beginFill');
  return { alpha: tokens[at + 3] as number, color: tokens[at + 2] as number };
}

function riveWithComposedAnimation(propertyKey: number, from: number, to: number): Uint8Array {
  // One clip drives a shared node transform and two format-owned targets on the same shape. The
  // final command stream proves all three samples land before the queued rebuild regenerates it.
  return buildRiveBytes([
    [1, [t(4, 'Board'), f(7, 100), f(8, 100)]],
    [3, [u(5, 0)]],
    [16, [u(5, 1)]],
    [5, [u(5, 2), f(24, 0), f(25, 0)]],
    [5, [u(5, 2), f(24, 50), f(25, 50)]],
    [20, [u(5, 1)]],
    [18, [u(5, 5), c(37, 0x40102030)]],
    [31, [t(55, 'composed'), u(56, 30), u(57, 30)]],
    [25, [u(51, 1)]],
    [26, [u(53, propertyKey)]],
    [30, [u(67, 0), f(70, from), u(68, 1)]],
    [30, [u(67, 30), f(70, to), u(68, 1)]],
    [25, [u(51, 3)]],
    [26, [u(53, 24)]],
    [30, [u(67, 0), f(70, 0), u(68, 1)]],
    [30, [u(67, 30), f(70, 60), u(68, 1)]],
    [25, [u(51, 6)]],
    [26, [u(53, 37)]],
    [37, [u(67, 0), c(88, 0x40102030), u(68, 1)]],
    [37, [u(67, 30), c(88, 0xc0506070), u(68, 1)]],
  ]);
}

function riveWithAnimatedVertex(propertyKey: number, from: number, to: number): Uint8Array {
  // Artboard > Shape > PointsPath > two straight vertices, with the first vertex's x keyed.
  return buildRiveBytes([
    [1, [t(4, 'Board'), f(7, 100), f(8, 100)]],
    [3, [u(5, 0)]],
    [16, [u(5, 1)]],
    [5, [u(5, 2), f(24, from), f(25, 0)]],
    [5, [u(5, 2), f(24, 50), f(25, 50)]],
    [31, [t(55, 'move'), u(56, 30), u(57, 30)]],
    [25, [u(51, 3)]],
    [26, [u(53, propertyKey)]],
    [30, [u(67, 0), f(70, from), u(68, 1)]],
    [30, [u(67, 30), f(70, to), u(68, 1)]],
  ]);
}

function riveWithAnimatedFill(from = 0xff112233, to = 0xffddeeff): Uint8Array {
  return buildRiveBytes([
    [1, [t(4, 'Board'), f(7, 100), f(8, 100)]],
    [3, [u(5, 0)]],
    [16, [u(5, 1)]],
    [5, [u(5, 2), f(24, 0), f(25, 0)]],
    [5, [u(5, 2), f(24, 50), f(25, 50)]],
    [20, [u(5, 1)]],
    [18, [u(5, 5), c(37, from)]],
    [31, [t(55, 'tint'), u(56, 30), u(57, 30)]],
    [25, [u(51, 6)]],
    [26, [u(53, 37)]],
    [37, [u(67, 0), c(88, from), u(68, 1)]],
    [37, [u(67, 30), c(88, to), u(68, 1)]],
  ]);
}

function varUint(value: number): number[] {
  const out: number[] = [];
  let remaining = value;
  do {
    const group = remaining % 128;
    remaining = Math.floor(remaining / 128);
    out.push(remaining > 0 ? group + 128 : group);
  } while (remaining > 0);
  return out;
}

function u(key: number, value: number): number[] {
  return [...varUint(key), ...varUint(value)];
}

function f(key: number, value: number): number[] {
  const view = new DataView(new ArrayBuffer(4));
  view.setFloat32(0, value, true);
  return [...varUint(key), view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3)];
}

function c(key: number, value: number): number[] {
  return [...varUint(key), value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff];
}

function t(key: number, value: string): number[] {
  const encoded = Array.from(new TextEncoder().encode(value));
  return [...varUint(key), ...varUint(encoded.length), ...encoded];
}

function buildRiveBytes(objects: Array<[number, number[][]]>): Uint8Array {
  const out: number[] = [0x52, 0x49, 0x56, 0x45, ...varUint(7), ...varUint(0), ...varUint(0), 0];
  for (const [typeKey, properties] of objects) {
    out.push(...varUint(typeKey));
    for (const property of properties) out.push(...property);
    out.push(0);
  }
  return new Uint8Array(out);
}
