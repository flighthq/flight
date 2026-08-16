import { sampleAnimationTrack } from '@flighthq/animation/contract';
import { collectImportDiagnostics } from '@flighthq/importdiagnostics/contract';
import { getNodeChildAt, getNodeChildCount } from '@flighthq/node/contract';
import { createDisplayObject } from '@flighthq/scene2d/contract';
import type {
  DisplayObject,
  ImportDiagnostic,
  Node2D,
  RiveArtboardGraph,
  RiveCoreObject,
  Shape,
} from '@flighthq/types/contract';
import { ImportDiagnosticSeverity, RiveFieldType, ShapeKind } from '@flighthq/types/contract';

import { applyAnimationClipToRiveDocument, createRiveAnimationClips } from './riveAnimation';
import { createScene2DFromRiveDocument } from './riveScene2D';
import { createRiveSkeleton2D } from './riveSkeleton';

// Time comes from the animation's OWN frame rate, so expectations below are computed from the
// frame/fps relation the format states rather than from what the builder produced. Interpolation type
// 0 is hold and 1 is linear; every other value defers to the interpolator object the keyframe names,
// which is why a test that wants a real curve must supply that object and not just the type.

const LINEAR_ANIMATION = 31;
const KEYED_OBJECT = 25;
const KEYED_PROPERTY = 26;
const KEYFRAME_DOUBLE = 30;
const CUBIC_INTERPOLATOR = 139;
const KEYFRAME_BOOL = 84;
const ARTBOARD = 1;
const ROOT_BONE = 41;
const ELASTIC_INTERPOLATOR = 174;
const SCRIPTED_INTERPOLATOR = 972;

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
const ROTATION = 15;
const SCALE_X = 16;
const ROOT_X = 90;
const EASING = 405;
const AMPLITUDE = 406;
const PERIOD = 407;

// Geometry and paint animate by writing the value back onto the core object the file keyed and
// rebuilding the owning shape, so the ordinary readers produce the result and there is no second
// code path to keep in step. Only transform properties bind through a display-object target; anything
// else reaches the screen through that write-back, so a channel count alone understates what animates.
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
    expect(fillPaint(shape).color).toBe(0x304050ff);
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

    expect(fillPaint(shape)).toEqual({ alpha: 1, color: 0xddeeffff });
  });

  it('interpolates packed ARGB by channel instead of treating it as one scalar', () => {
    const result = createScene2DFromRiveDocument(riveWithAnimatedFill(0x40102030, 0xc0506070));
    const shape = firstShape(result);

    applyAnimationClipToRiveDocument(result.artboards[0].animations[0].clip, 0.5);

    expect(fillPaint(shape).color).toBe(0x304050ff);
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

// One bone keyed on a single property, with the rig flattened as the importer would.
function buildBoneProperty(
  propertyKey: number,
  value: number,
  setupRotation: number,
  setup: Readonly<{ scaleX?: number; x?: number }> = {},
  diagnostics?: ImportDiagnostic[],
) {
  const objects: RiveCoreObject[] = [
    object(ARTBOARD, {}),
    object(ROOT_BONE, { [ROTATION]: setupRotation, [ROOT_X]: setup.x ?? 0, [SCALE_X]: setup.scaleX ?? 1 }),
    object(LINEAR_ANIMATION, { [FPS]: 1, [DURATION]: 1 }),
    object(KEYED_OBJECT, { [OBJECT_ID]: 1 }),
    object(KEYED_PROPERTY, { [PROPERTY_KEY]: propertyKey }),
    object(KEYFRAME_DOUBLE, { [FRAME]: 0, [INTERPOLATION]: 1, [VALUE]: value }),
    object(KEYFRAME_DOUBLE, { [FRAME]: 1, [INTERPOLATION]: 1, [VALUE]: value }),
  ];
  const artboard: RiveArtboardGraph = {
    objects,
    parentIndices: [-1, 0, -1, -1, -1, -1, -1],
    streamEnd: objects.length,
    streamStart: 0,
  };
  const skeleton = createRiveSkeleton2D(artboard)!;
  return {
    clips: createRiveAnimationClips(
      objects,
      { end: objects.length, start: 2 },
      [],
      artboard,
      new Map(),
      skeleton,
      diagnostics,
    ),
    skeleton,
  };
}

function buildBoneRotation(value: number, setupRotation: number) {
  return buildBoneProperty(15, value, setupRotation);
}

function build(
  fps: number,
  propertyKey: number,
  frames: ReadonlyArray<{ frame: number; interpolation?: number; value: number }>,
  nodes?: Array<DisplayObject | null>,
  objectId = 0,
  diagnostics?: ImportDiagnostic[],
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
    clips: createRiveAnimationClips(
      objects,
      { end: objects.length, start: 0 },
      resolved,
      emptyArtboard(),
      new Map(),
      null,
      diagnostics,
    ),
  };
}

// A keyframe naming an interpolator by id, where the interpolator object precedes the animation in
// the stream. Interpolation type 2 is what the corpus uses whenever an interpolator is named. The
// keyed property is x (13) rather than rotation, because rotation converts radians to degrees and a
// sampled value would then have to be read through that conversion to mean anything.
function buildWithInterpolator(
  typeKey: number,
  properties: Readonly<Record<number, number>>,
  diagnostics?: ImportDiagnostic[],
) {
  const objects: RiveCoreObject[] = [
    object(typeKey, properties),
    object(LINEAR_ANIMATION, { [FPS]: 1, [DURATION]: 1 }),
    object(KEYED_OBJECT, { [OBJECT_ID]: 0 }),
    object(KEYED_PROPERTY, { [PROPERTY_KEY]: 13 }),
    object(KEYFRAME_DOUBLE, { [FRAME]: 0, [INTERPOLATION]: 2, [INTERPOLATOR_ID]: 0, [VALUE]: 0 }),
    object(KEYFRAME_DOUBLE, { [FRAME]: 1, [INTERPOLATION]: 2, [INTERPOLATOR_ID]: 0, [VALUE]: 100 }),
  ];
  return {
    clips: createRiveAnimationClips(
      objects,
      { end: objects.length, start: 0 },
      [createDisplayObject()],
      emptyArtboard(),
      new Map(),
      null,
      diagnostics,
    ),
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

  it('reports a loop mode it does not know, which plays once rather than being dropped', () => {
    // The clip survives at full length and simply repeats wrongly, so neither an existence check nor a
    // count can see it. A genuine one-shot is the documented default and must stay silent, which the
    // test below this one holds.
    let clips: ReturnType<typeof createRiveAnimationClips> = [];
    const diagnostics = collectImportDiagnostics((sink) => {
      clips = createRiveAnimationClips(
        [object(LINEAR_ANIMATION, { [FPS]: 30, [LOOP]: 99 })],
        { end: 1, start: 0 },
        [],
        emptyArtboard(),
        new Map(),
        undefined,
        sink,
      );
    });

    expect(clips[0].loop).toBe('OneShot');
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].kind).toBe('rive.animation-loop-substituted');
    expect(diagnostics[0].severity).toBe(ImportDiagnosticSeverity.Recover);
    expect(diagnostics[0].detail).toEqual({ loopValue: 99, substitutedAs: 'oneShot' });
  });

  it('stays silent for a genuine one shot, so the substitution crumb carries information', () => {
    const diagnostics = collectImportDiagnostics((sink) => {
      const clips = createRiveAnimationClips(
        [object(LINEAR_ANIMATION, { [FPS]: 30, [LOOP]: 0 })],
        { end: 1, start: 0 },
        [],
        emptyArtboard(),
        new Map(),
        undefined,
        sink,
      );
      // Non-vacuous: a run that produced no clip would be silent for the wrong reason.
      expect(clips[0].loop).toBe('OneShot');
    });

    expect(diagnostics).toEqual([]);
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

  // An elastic interpolator resolves through interpolatorId exactly as a cubic one does. Gathering
  // only the cubic family is what previously left these segments resolving to nothing and silently
  // falling back to linear.
  it('resolves an elastic interpolator instead of falling back to linear', () => {
    const { clips } = buildWithInterpolator(ELASTIC_INTERPOLATOR, { [AMPLITUDE]: 1, [PERIOD]: 0.4, [EASING]: 1 });
    const track = clips[0].clip.channels[0].track;

    // With amplitude 1 and period 0.4, t=0.5 is one full wave after the 0.1 phase and therefore lands
    // exactly on the target. A linear fallback would instead produce 50.
    sampleAnimationTrack(_scratch, track, 0.5);
    expect(_scratch[0]).toBeCloseTo(100, 6);
  });

  // A keyframe naming an interpolator this reader does not build loses only its CURVE: the channel is
  // present and runs full length, so the segment silently straightens to linear.
  it('reports a keyframe interpolator it cannot resolve', () => {
    const diagnostics: ImportDiagnostic[] = [];
    const { clips } = build(
      1,
      13,
      [
        { frame: 0, interpolation: 2, value: 0 },
        { frame: 1, interpolation: 2, value: 100 },
      ],
      undefined,
      0,
      diagnostics,
    );

    // The channel survives — that is what makes this a substitution rather than a drop.
    expect(clips[0].clip.channels).toHaveLength(1);
    expect(diagnostics).toMatchObject([
      {
        detail: { interpolationType: 2, interpolatorId: -1, substitutedAs: 'linear' },
        kind: 'rive.keyframe-easing-substituted',
        severity: 'Recover',
      },
      {
        detail: { interpolationType: 2, interpolatorId: -1, substitutedAs: 'linear' },
        kind: 'rive.keyframe-easing-substituted',
        severity: 'Recover',
      },
    ]);
  });

  it('stays silent for hold and linear, which name no interpolator', () => {
    const diagnostics: ImportDiagnostic[] = [];
    const { clips } = build(
      1,
      13,
      [
        { frame: 0, interpolation: 0, value: 0 },
        { frame: 1, interpolation: 1, value: 100 },
      ],
      undefined,
      0,
      diagnostics,
    );

    // Sampling proves the silence is not vacuous: hold keeps the first value across its segment.
    sampleAnimationTrack(_scratch, clips[0].clip.channels[0].track, 0.5);
    expect(_scratch[0]).toBeCloseTo(0, 6);
    expect(diagnostics).toEqual([]);
  });

  // An elastic ease the reader does not know still runs for its full duration, eased from the wrong
  // end. Nothing counts as lost and the channel is present, so only the crumb records it.
  it('reports an elastic easing mode it does not know', () => {
    const diagnostics: ImportDiagnostic[] = [];
    buildWithInterpolator(ELASTIC_INTERPOLATOR, { [AMPLITUDE]: 1, [PERIOD]: 0.4, [EASING]: 6 }, diagnostics);

    expect(diagnostics).toMatchObject([
      {
        detail: { easingValue: 6, substitutedAs: 'easeOut' },
        kind: 'rive.elastic-easing-substituted',
        severity: 'Recover',
      },
    ]);
  });

  it('stays silent across every elastic easing the format states', () => {
    const diagnostics: ImportDiagnostic[] = [];
    // Ease-out is 1 and is also what the terminal arm returns, so it shares that arm with an unknown
    // value and must not report. Sampling proves the silence is not vacuous.
    for (const easing of [0, 1, 2]) {
      const { clips } = buildWithInterpolator(
        ELASTIC_INTERPOLATOR,
        { [AMPLITUDE]: 1, [PERIOD]: 0.4, [EASING]: easing },
        diagnostics,
      );
      expect(clips[0].clip.channels).toHaveLength(1);
    }

    expect(diagnostics).toEqual([]);
  });

  it('uses the amplitude and period the interpolator states rather than fixed constants', () => {
    const narrow = buildWithInterpolator(ELASTIC_INTERPOLATOR, { [AMPLITUDE]: 1, [PERIOD]: 0.2, [EASING]: 1 });
    const wide = buildWithInterpolator(ELASTIC_INTERPOLATOR, { [AMPLITUDE]: 1, [PERIOD]: 0.9, [EASING]: 1 });

    const sampled = (result: ReturnType<typeof buildWithInterpolator>, time: number): number => {
      sampleAnimationTrack(_scratch, result.clips[0].clip.channels[0].track, time);
      return _scratch[0];
    };
    // At t=0.1 the stated damped-sine formula gives 150 for period 0.2 and 61.6977778440511 for 0.9.
    // Fixed constants, ignored properties, or a linear fallback cannot produce this pair.
    expect(sampled(narrow, 0.1)).toBeCloseTo(150, 6);
    expect(sampled(wide, 0.1)).toBeCloseTo(61.6977778440511, 6);
  });

  // ScriptedInterpolator runs Rive's own scripting language, which a codec does not execute. Its
  // segments fall back to linear, and that is a scope boundary rather than a gap to close.
  it('falls back to linear for a scripted interpolator', () => {
    const { clips } = buildWithInterpolator(SCRIPTED_INTERPOLATOR, {});
    const track = clips[0].clip.channels[0].track;

    sampleAnimationTrack(_scratch, track, 0.5);
    expect(_scratch[0]).toBeCloseTo(50, 6);
  });

  // A Rive bone is a TransformComponent, never a display object, so its channels were dropped before
  // this bound them — which is the mechanism behind the corpus clips that imported with no channels.
  it('binds a bone rotation channel against the flattened rig', () => {
    const { clips, skeleton } = buildBoneRotation(Math.PI / 2, 0);
    const target = clips[0].clip.channels[0].targetRef as { boneIndex: number; path: string };

    expect(clips[0].clip.channels).toHaveLength(1);
    expect(target.boneIndex).toBe(skeleton.boneIndices[1]);
    expect(target.path).toBe('Rotation');
  });

  // Rive states an ABSOLUTE value; applyAnimationClipToSkeleton2D composes a DELTA onto the setup bone.
  // The conversion is exact rather than approximate: degrees first, then subtract the setup rotation.
  it('converts an absolute rive rotation into the delta the skeleton binder composes', () => {
    const { clips } = buildBoneRotation(Math.PI, Math.PI / 2);
    const track = clips[0].clip.channels[0].track;

    // Setup holds 90 degrees and the keyframe states 180, so the delta the binder needs is 90.
    sampleAnimationTrack(_scratch, track, 1);
    expect(_scratch[0]).toBeCloseTo(90, 3);
  });

  // Rive keys ONE SCALAR PER PROPERTY, which is exactly what the per-axis paths take, so each maps
  // straight across with no axis paired to another and no keyframe times invented.
  it('binds each bone axis to its own per-axis path', () => {
    const paths = [
      [13, 'TranslationX'],
      [14, 'TranslationY'],
      [15, 'Rotation'],
      [16, 'ScaleX'],
      [17, 'ScaleY'],
    ] as const;

    for (const [propertyKey, expected] of paths) {
      const { clips } = buildBoneProperty(propertyKey, 1, 0);
      expect((clips[0].clip.channels[0].targetRef as { path: string }).path).toBe(expected);
    }
  });

  it('subtracts the setup value for translation, which the binder adds back', () => {
    const { clips } = buildBoneProperty(13, 30, 0, { x: 12 });

    sampleAnimationTrack(_scratch, clips[0].clip.channels[0].track, 1);
    expect(_scratch[0]).toBeCloseTo(18, 6);
  });

  it('divides by the setup value for scale, which the binder multiplies back', () => {
    // Scale composes by MULTIPLICATION, so the inverse is division rather than subtraction.
    const { clips } = buildBoneProperty(16, 3, 0, { scaleX: 2 });

    sampleAnimationTrack(_scratch, clips[0].clip.channels[0].track, 1);
    expect(_scratch[0]).toBeCloseTo(1.5, 6);
  });

  it('drops a scale channel the relative model cannot express, and says so', () => {
    // A setup scale of zero multiplies every factor back to zero, so no channel reproduces a non-zero
    // authored scale. Dropping it is honest; emitting one would be silently wrong.
    const diagnostics: ImportDiagnostic[] = [];
    const { clips } = buildBoneProperty(16, 3, 0, { scaleX: 0 }, diagnostics);

    expect(clips[0].clip.channels).toHaveLength(0);
    expect(diagnostics.map((entry) => entry.kind)).toEqual(['rive.unrepresentable-bone-scale']);
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
    expect(out[0]).toBeCloseTo(2.401618414996858, 6);
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

  it('binds no channel for a keyed object naming a node that does not exist', () => {
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
    const diagnostics: ImportDiagnostic[] = [];
    const clips = createRiveAnimationClips(
      objects,
      { end: objects.length, start: 0 },
      [null, createDisplayObject()],
      artboard,
      new Map([[1, () => undefined]]),
      null,
      diagnostics,
    );

    // Refusing to read it as a double is the point; losing the channel without a word is not. The clip
    // still imports and still plays, so the crumb is the only trace that a property stopped moving.
    expect(clips[0].clip.channels).toHaveLength(0);
    expect(diagnostics).toMatchObject([
      {
        detail: { keyframeTypeKey: KEYFRAME_BOOL, propertyKey: 41 },
        kind: 'rive.keyframe-kind-unsupported',
        severity: 'Drop',
      },
    ]);
  });

  it('reports a keyed object whose whole property run bound nothing', () => {
    const diagnostics: ImportDiagnostic[] = [];
    // Object id 5 names nothing: no display node, no bone. Every channel under it is unreachable, and
    // the clip imports shorter than it was authored with nothing else to say which target went missing.
    const { clips } = build(30, 13, [{ frame: 0, value: 1 }], [], 5, diagnostics);

    expect(clips[0].clip.channels).toHaveLength(0);
    expect(diagnostics).toMatchObject([
      { detail: { objectId: 5, properties: 1 }, kind: 'rive.keyed-object-unbound', severity: 'Drop' },
    ]);
  });

  it('stays silent for a bone, which binds through the rig rather than a display node', () => {
    const diagnostics: ImportDiagnostic[] = [];
    // A bone is a TransformComponent and never becomes a display object, so a keyed-object check that
    // asked "did this resolve to a node" would fire here on ordinary content. Asking what the run
    // BOUND is what keeps it quiet, and the channel proves the silence is not an empty clip.
    const { clips } = buildBoneProperty(15, 0.5, 0, {}, diagnostics);

    expect(clips[0].clip.channels.length).toBeGreaterThan(0);
    expect(diagnostics.filter((entry) => entry.kind === 'rive.keyed-object-unbound')).toEqual([]);
  });

  it('does not add a second report when the run already explained itself', () => {
    const diagnostics: ImportDiagnostic[] = [];
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
    createRiveAnimationClips(
      objects,
      { end: objects.length, start: 0 },
      [null, createDisplayObject()],
      artboard,
      new Map([[1, () => undefined]]),
      null,
      diagnostics,
    );

    // The keyframe-kind crumb already names why nothing bound. A second, vaguer report over the top
    // would double-count one loss and make the totals disagree with the number of things gone wrong.
    expect(diagnostics.map((entry) => entry.kind)).toEqual(['rive.keyframe-kind-unsupported']);
  });

  it('stays silent for a keyed property carrying no keyframe at all', () => {
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
    ];
    const diagnostics: ImportDiagnostic[] = [];
    const clips = createRiveAnimationClips(
      objects,
      { end: objects.length, start: 0 },
      [null, createDisplayObject()],
      artboard,
      new Map([[1, () => undefined]]),
      null,
      diagnostics,
    );

    // Nothing was authored here, so nothing was lost — an absent keyframe must not read as an
    // unsupported one. The clip is still produced, which is what keeps this silence non-vacuous.
    expect(clips).toHaveLength(1);
    expect(diagnostics).toEqual([]);
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

const _scratch = new Array<number>(8).fill(0);
