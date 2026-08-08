import {
  createAnimationChannel,
  createAnimationClip,
  createAnimationTrack,
  sampleAnimationTrack,
} from '@flighthq/animation/contract';
import { easeCubicBezier, easeInDampedSine, easeInOutDampedSine, easeOutDampedSine } from '@flighthq/easing/contract';
import { reportImportDiagnostic } from '@flighthq/importdiagnostics/contract';
import { RAD_TO_DEG } from '@flighthq/math/contract';
import { applyAnimationClipToNode2D } from '@flighthq/scene2d/contract';
import { createSkeleton2DBoneAnimationTarget } from '@flighthq/skeleton2d/contract';
import {
  RiveAnimationLoop as RiveAnimationLoopValue,
  ImportDiagnosticSeverity,
  RiveFieldType,
  Skeleton2DAnimationPath,
} from '@flighthq/types/contract';
import type {
  AnimationChannel,
  AnimationClip,
  RiveArtboardGraph,
  RiveAnimationClip,
  RiveAnimationLoop,
  RiveSkeleton2DImport,
  Bone2D,
  ImportDiagnostic,
  DisplayObject,
  EasingFunction,
  Node2DAnimationPath,
  Node2DAnimationTarget,
  RiveCoreObject,
} from '@flighthq/types/contract';

import { isRiveCoreTypeDerivedFrom } from './riveCoreTypes';

/**
 * Samples a Rive clip, applying both the shared display-object channels and the format-owned ones
 * that drive geometry and paint. Playback stays explicit, as it does for Lottie.
 */
export function applyAnimationClipToRiveDocument(clip: Readonly<AnimationClip>, time: number): void {
  applyAnimationClipToNode2D(clip, time);
  for (const channel of clip.channels) {
    const target = channel.targetRef as RiveMutableTarget | null;
    if (target === null || typeof target !== 'object' || target.riveApply === undefined) continue;
    sampleAnimationTrack(_sampleScratch, channel.track, time);
    target.riveApply(_sampleScratch);
  }
  // Rebuilding once per shape after every channel has landed keeps a shape with several animated
  // vertices from regenerating its whole command stream once per vertex.
  for (const rebuild of _pendingRebuilds) rebuild();
  _pendingRebuilds.clear();
}

/**
 * Builds one `AnimationClip` per Rive linear animation.
 *
 * Animations are not components: they follow their artboard in the stream but sit outside the
 * artboard's numbering, so they are read from the raw object list while their `objectId` references
 * point back into that numbering. Time comes from the animation's own frame rate rather than the
 * document's, since each animation states its own.
 */
export function createRiveAnimationClips(
  objects: readonly Readonly<RiveCoreObject>[],
  range: Readonly<{ end: number; start: number }>,
  nodes: ReadonlyArray<DisplayObject | null>,
  artboard: Readonly<RiveArtboardGraph>,
  rebuilds: ReadonlyMap<number, () => void>,
  skeleton: Readonly<RiveSkeleton2DImport> | null = null,
  diagnostics?: ImportDiagnostic[],
): RiveAnimationClip[] {
  const interpolators = collectRiveInterpolators(objects, range);
  const clips: RiveAnimationClip[] = [];
  for (let index = range.start; index < range.end; index++) {
    if (objects[index].typeKey !== RIVE_LINEAR_ANIMATION) continue;
    clips.push(
      createRiveAnimationClip(
        objects,
        index,
        range.end,
        nodes,
        interpolators,
        artboard,
        rebuilds,
        skeleton,
        diagnostics,
      ),
    );
  }
  return clips;
}

interface RiveMutableTarget {
  riveApply(sample: Readonly<number[] | Float32Array>): void;
}

function createRiveAnimationClip(
  objects: readonly Readonly<RiveCoreObject>[],
  start: number,
  limit: number,
  nodes: ReadonlyArray<DisplayObject | null>,
  interpolators: ReadonlyMap<number, EasingFunction>,
  artboard: Readonly<RiveArtboardGraph>,
  rebuilds: ReadonlyMap<number, () => void>,
  skeleton: Readonly<RiveSkeleton2DImport> | null,
  diagnostics: ImportDiagnostic[] | undefined,
): RiveAnimationClip {
  const source = objects[start];
  const fps = Math.max(1, readRiveNumber(source, RIVE_ANIMATION_FPS, 60));
  const channels: AnimationChannel[] = [];

  let keyed: DisplayObject | null = null;
  let keyedIndex = -1;
  for (let index = start + 1; index < limit; index++) {
    const object = objects[index];
    // Another animation or a state machine ends this one's run of keyed data.
    if (object.typeKey === RIVE_LINEAR_ANIMATION) break;
    if (object.typeKey === RIVE_KEYED_OBJECT) {
      keyedIndex = readRiveNumber(object, RIVE_KEYED_OBJECT_ID, -1);
      keyed = keyedIndex >= 0 && keyedIndex < nodes.length ? nodes[keyedIndex] : null;
      continue;
    }
    if (object.typeKey !== RIVE_KEYED_PROPERTY) continue;
    const propertyKey = readRiveNumber(object, RIVE_KEYED_PROPERTY_KEY, -1);
    // A bone is a TransformComponent rather than a Node, so it never became a display object and
    // `keyed` is null for it. Its channels drive the flattened Skeleton2D instead, which is why the
    // rig has to be consulted before the display-object path rather than after it.
    const boneChannel = createRiveBoneChannel(
      objects,
      index,
      limit,
      fps,
      interpolators,
      skeleton,
      keyedIndex,
      propertyKey,
      diagnostics,
    );
    if (boneChannel !== null) {
      channels.push(boneChannel);
      continue;
    }
    const path = toRiveAnimationPath(propertyKey);
    if (path !== null && keyed !== null) {
      const channel = createRiveChannel(objects, index, limit, fps, interpolators, toRiveValueConversion(path), {
        node: keyed,
        path,
      } satisfies Node2DAnimationTarget);
      if (channel !== null) channels.push(channel);
      continue;
    }
    // Anything else drives geometry or paint: write the value back onto the object the file keyed and
    // let the owning shape rebuild from it, which is why no property needs its own binder.
    const keyframeType = objects[index + 1]?.typeKey;
    if (keyframeType !== RIVE_KEYFRAME_DOUBLE && keyframeType !== RIVE_KEYFRAME_COLOR) continue;
    const target = createRiveMutableTarget(
      artboard,
      rebuilds,
      keyedIndex,
      propertyKey,
      keyframeType === RIVE_KEYFRAME_COLOR ? RiveFieldType.Color : RiveFieldType.Double,
    );
    if (target === null) continue;
    const channel = createRiveMutableChannel(objects, index, limit, fps, interpolators, target);
    if (channel !== null) channels.push(channel);
  }

  const duration = readRiveNumber(source, RIVE_ANIMATION_DURATION, 60) / fps;
  // The work area is stated in frames and only applies when the animation enables it. Its unset
  // sentinel is -1 rather than 0, which is a real frame, so an absent bound stays absent.
  const hasWorkArea = readRiveNumber(source, RIVE_ANIMATION_ENABLE_WORK_AREA, 0) !== 0;
  const workStart = readRiveNumber(source, RIVE_ANIMATION_WORK_START, RIVE_UNSET_FRAME);
  const workEnd = readRiveNumber(source, RIVE_ANIMATION_WORK_END, RIVE_UNSET_FRAME);
  return {
    clip: createAnimationClip(channels, duration),
    loop: toRiveAnimationLoop(readRiveNumber(source, RIVE_ANIMATION_LOOP, RIVE_LOOP_ONE_SHOT), diagnostics),
    name: readRiveText(source, RIVE_ANIMATION_NAME, ''),
    speed: readRiveNumber(source, RIVE_ANIMATION_SPEED, 1),
    workAreaEnd: !hasWorkArea || workEnd < 0 ? null : workEnd / fps,
    workAreaStart: !hasWorkArea || workStart < 0 ? null : workStart / fps,
  };
}

// An unrecognized mode falls to one-shot, which is the format's own initial value and the reading
// that shows least: a file naming a mode this reader does not know plays once rather than repeating
// forever.
function toRiveAnimationLoop(value: number, diagnostics: ImportDiagnostic[] | undefined): RiveAnimationLoop {
  if (value === RIVE_LOOP_LOOP) return RiveAnimationLoopValue.Loop;
  if (value === RIVE_LOOP_PING_PONG) return RiveAnimationLoopValue.PingPong;
  // The value arrives raw from the file with no mask, so this arm absorbs any mode Rive adds later and
  // the animation plays ONCE instead. The clip survives at full length and simply repeats wrongly, which
  // no existence check and no count can see — so an unrecognised value reports rather than passing as a
  // one-shot the file never asked for. A genuine one-shot is the documented default and reports nothing.
  if (value !== RIVE_LOOP_ONE_SHOT) {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Recover,
      'rive.animation-loop-substituted',
      'createScene2DFromRiveDocument',
      { loopValue: value, substitutedAs: 'oneShot' },
    );
  }
  return RiveAnimationLoopValue.OneShot;
}

/**
 * Binds one keyed bone property to the flattened `Skeleton2D`, or `null` when the keyed object is not
 * a bone or the property is not one a bone carries.
 *
 * **Every bone property Rive keys now binds, through the per-axis paths.** Rive states one scalar per
 * property — x, y, rotation, scaleX and scaleY each their own channel with independently authored
 * keyframe times — and `TranslationX`/`TranslationY`, `ScaleX`/`ScaleY` take exactly that, so each maps
 * straight across with no axis paired to another. Pairing was never possible without resampling onto a
 * merged time set and inventing keyframe times the file never stated; the per-axis vocabulary removes
 * the need rather than working around it. Bones carry no shear in this format.
 *
 * **Rive states absolutes; the binder composes.** It ADDS for translation and rotation and MULTIPLIES
 * for scale, so the inverse differs per path — subtract the setup value, or divide by it — and the
 * conversion happens once at build time rather than per sample.
 *
 * Composing onto the setup pose rather than baking absolutes is what keeps a clip blendable, which is
 * why the conversion belongs here rather than in the binder.
 */
function createRiveBoneChannel(
  objects: readonly Readonly<RiveCoreObject>[],
  propertyIndex: number,
  limit: number,
  fps: number,
  interpolators: ReadonlyMap<number, EasingFunction>,
  skeleton: Readonly<RiveSkeleton2DImport> | null,
  keyedIndex: number,
  propertyKey: number,
  diagnostics: ImportDiagnostic[] | undefined,
): AnimationChannel | null {
  if (skeleton === null || keyedIndex < 0 || keyedIndex >= skeleton.boneIndices.length) return null;
  const boneIndex = skeleton.boneIndices[keyedIndex];
  if (boneIndex < 0) return null;
  const path = toRiveBoneAnimationPath(propertyKey);
  if (path === null) return null;

  const convert = toRiveBoneValueConversion(path, skeleton.skeleton.bones[boneIndex]);
  // A setup scale of zero has no factor that reaches a non-zero value, so the channel is dropped rather
  // than approximated — reported, since a rig can legitimately be authored that way.
  if (convert === null) {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Drop,
      'rive.unrepresentable-bone-scale',
      'createRiveAnimationClips',
      { bone: boneIndex, property: propertyKey },
    );
    return null;
  }

  return createRiveChannel(
    objects,
    propertyIndex,
    limit,
    fps,
    interpolators,
    convert,
    createSkeleton2DBoneAnimationTarget(boneIndex, path),
  );
}

// Rive keys ONE SCALAR PER PROPERTY, which is exactly what the per-axis paths take — so each maps
// straight across and no axis has to be paired with another. Bones carry no shear in this format.
function toRiveBoneAnimationPath(propertyKey: number): Skeleton2DAnimationPath | null {
  if (propertyKey === RIVE_X || propertyKey === RIVE_X_LEGACY) return Skeleton2DAnimationPath.TranslationX;
  if (propertyKey === RIVE_Y || propertyKey === RIVE_Y_LEGACY) return Skeleton2DAnimationPath.TranslationY;
  if (propertyKey === RIVE_ROTATION) return Skeleton2DAnimationPath.Rotation;
  if (propertyKey === RIVE_SCALE_X) return Skeleton2DAnimationPath.ScaleX;
  return propertyKey === RIVE_SCALE_Y ? Skeleton2DAnimationPath.ScaleY : null;
}

/**
 * Turns a Rive keyframe's ABSOLUTE value into the RELATIVE one the skeleton binder composes, or `null`
 * when no such value exists.
 *
 * The binder ADDS for translation and rotation and MULTIPLIES for scale, so the inverse differs per
 * path: subtract the setup value, or divide by it. Division is why this can fail — a setup scale of
 * zero multiplies every factor back to zero, so no channel can reproduce a non-zero authored scale.
 * That is a real limit of a relative model rather than a gap in the vocabulary, and it is the one case
 * here that cannot be expressed.
 */
function toRiveBoneValueConversion(
  path: Skeleton2DAnimationPath,
  setup: Readonly<Bone2D>,
): ((value: number) => number) | null {
  if (path === Skeleton2DAnimationPath.TranslationX) return (value) => value - setup.x;
  if (path === Skeleton2DAnimationPath.TranslationY) return (value) => value - setup.y;
  // Rive states rotation in radians and Bone2D is degrees, so the unit conversion precedes the delta.
  if (path === Skeleton2DAnimationPath.Rotation) return (value) => value * RAD_TO_DEG - setup.rotation;
  const setupScale = path === Skeleton2DAnimationPath.ScaleX ? setup.scaleX : setup.scaleY;
  if (setupScale === 0) return null;
  return (value) => value / setupScale;
}

function createRiveChannel(
  objects: readonly Readonly<RiveCoreObject>[],
  propertyIndex: number,
  limit: number,
  fps: number,
  interpolators: ReadonlyMap<number, EasingFunction>,
  convert: (value: number) => number,
  targetRef: unknown,
): AnimationChannel | null {
  return createRiveTypedChannel(
    objects,
    propertyIndex,
    limit,
    fps,
    interpolators,
    1,
    (keyframe) =>
      keyframe.typeKey === RIVE_KEYFRAME_DOUBLE
        ? [convert(readRiveNumber(keyframe, RIVE_KEYFRAME_DOUBLE_VALUE, 0))]
        : null,
    targetRef,
  );
}

function createRiveMutableChannel(
  objects: readonly Readonly<RiveCoreObject>[],
  propertyIndex: number,
  limit: number,
  fps: number,
  interpolators: ReadonlyMap<number, EasingFunction>,
  targetRef: RiveMutableTarget,
): AnimationChannel | null {
  const first = objects[propertyIndex + 1];
  if (first?.typeKey === RIVE_KEYFRAME_COLOR) {
    return createRiveTypedChannel(
      objects,
      propertyIndex,
      limit,
      fps,
      interpolators,
      4,
      readRiveColorKeyframe,
      targetRef,
    );
  }
  return createRiveChannel(objects, propertyIndex, limit, fps, interpolators, (value) => value, targetRef);
}

function createRiveTypedChannel(
  objects: readonly Readonly<RiveCoreObject>[],
  propertyIndex: number,
  limit: number,
  fps: number,
  interpolators: ReadonlyMap<number, EasingFunction>,
  components: number,
  readValue: (keyframe: Readonly<RiveCoreObject>) => readonly number[] | null,
  targetRef: unknown,
): AnimationChannel | null {
  const times: number[] = [];
  const values: number[] = [];
  const segmentEasings: Array<EasingFunction | null> = [];

  for (let index = propertyIndex + 1; index < limit; index++) {
    const object = objects[index];
    if (!isRiveCoreTypeDerivedFrom(object.typeKey, RIVE_INTERPOLATING_KEYFRAME)) break;
    const value = readValue(object);
    if (value === null) break;
    const time = readRiveNumber(object, RIVE_KEYFRAME_FRAME, 0) / fps;
    // A repeated frame would give the track two samples at one time; the first one wins.
    if (times.length > 0 && time <= times[times.length - 1]) continue;
    times.push(time);
    values.push(...value);
    // A keyframe's interpolation governs the segment that LEAVES it, so the last one contributes none.
    segmentEasings.push(toRiveSegmentEasing(object, interpolators));
  }
  if (times.length === 0) return null;
  segmentEasings.pop();

  return createAnimationChannel(
    createAnimationTrack({ components, interpolation: 'Linear', segmentEasings, times, values }),
    targetRef,
  );
}

function readRiveColorKeyframe(keyframe: Readonly<RiveCoreObject>): readonly number[] | null {
  if (keyframe.typeKey !== RIVE_KEYFRAME_COLOR) return null;
  const packed = readRiveNumber(keyframe, RIVE_KEYFRAME_COLOR_VALUE, 0) >>> 0;
  // Rive stores ARGB. Interpolating the packed integer would carry between bytes, so sample the four
  // channels independently and put them back into the same wire order when the binder applies them.
  return [(packed >>> 24) & 0xff, (packed >>> 16) & 0xff, (packed >>> 8) & 0xff, packed & 0xff];
}

/**
 * A writer for one keyed property that is not a node transform — a vertex position, a corner radius,
 * a colour, a stroke width. It sets the value back on the core object the file keyed and queues the
 * owning shape's rebuild, so the ordinary readers produce the animated geometry with no second code
 * path to keep in step.
 */
function createRiveMutableTarget(
  artboard: Readonly<RiveArtboardGraph>,
  rebuilds: ReadonlyMap<number, () => void>,
  objectIndex: number,
  propertyKey: number,
  defaultType: RiveFieldType,
): RiveMutableTarget | null {
  if (objectIndex < 0 || objectIndex >= artboard.objects.length || propertyKey < 0) return null;
  const object = artboard.objects[objectIndex];
  const rebuild = rebuilds.get(findRiveShapeOwner(artboard, objectIndex));
  if (rebuild === undefined) return null;

  const property = object.properties.find((candidate) => candidate.key === propertyKey);
  // A file may key a property it never states, in which case the value starts at the format default.
  const slot = property ?? { key: propertyKey, type: defaultType, value: 0 };
  if (property === undefined) object.properties.push(slot);

  return {
    riveApply(sample: Readonly<number[] | Float32Array>): void {
      slot.value = slot.type === RiveFieldType.Color ? packRiveColorSample(sample) : sample[0];
      _pendingRebuilds.add(rebuild);
    },
  };
}

function packRiveColorSample(sample: Readonly<number[] | Float32Array>): number {
  const alpha = toRiveColorByte(sample[0]);
  const red = toRiveColorByte(sample[1]);
  const green = toRiveColorByte(sample[2]);
  const blue = toRiveColorByte(sample[3]);
  return ((alpha << 24) | (red << 16) | (green << 8) | blue) >>> 0;
}

function toRiveColorByte(value: number): number {
  return Math.round(Math.min(0xff, Math.max(0, value)));
}

// The nearest ancestor that is a Shape, including the object itself.
function findRiveShapeOwner(artboard: Readonly<RiveArtboardGraph>, index: number): number {
  let current = index;
  while (current > 0) {
    if (isRiveCoreTypeDerivedFrom(artboard.objects[current].typeKey, RIVE_SHAPE_TYPE_KEY)) return current;
    current = artboard.parentIndices[current];
  }
  return -1;
}

// Type 0 is hold and type 1 is linear, established from the corpus: type 2 carries an interpolator in
// 18,044 of 18,608 cases while type 1 never does and type 0 almost never.
//
// Every other value defers to the interpolator the keyframe names, because the *object* is what
// carries the behaviour. Rive's own runtime never switches on this enum — `InterpolatingKeyFrame`
// resolves `interpolatorId` and uses whatever `KeyFrameInterpolator` it lands on — so treating an
// unrecognized enum value as unsupported would reject curves that resolve perfectly well.
function toRiveSegmentEasing(
  keyframe: Readonly<RiveCoreObject>,
  interpolators: ReadonlyMap<number, EasingFunction>,
): EasingFunction | null {
  const type = readRiveNumber(keyframe, RIVE_KEYFRAME_INTERPOLATION, RIVE_INTERPOLATION_HOLD);
  if (type === RIVE_INTERPOLATION_HOLD) return _holdEasing;
  if (type === RIVE_INTERPOLATION_LINEAR) return null;
  const id = readRiveNumber(keyframe, RIVE_KEYFRAME_INTERPOLATOR_ID, -1);
  return interpolators.get(id) ?? null;
}

/**
 * Collects every interpolator a keyframe can name, by concrete type.
 *
 * `KeyFrameInterpolator` has three concrete subclasses and each states its own curve:
 * `CubicInterpolator` (with its ease and value variants), `ElasticInterpolator`, and
 * `ScriptedInterpolator`. Gathering only the cubic family is what left elastic segments resolving to
 * nothing and silently falling back to linear.
 *
 * `ScriptedInterpolator` is **not** collected and is not a gap to close here: it runs Rive's own
 * scripting language, which a codec does not execute. Its segments fall back to linear.
 */
function collectRiveInterpolators(
  objects: readonly Readonly<RiveCoreObject>[],
  range: Readonly<{ end: number; start: number }>,
): Map<number, EasingFunction> {
  const interpolators = new Map<number, EasingFunction>();
  // An interpolator is addressed by its position in the artboard's own numbering, which for these
  // non-component objects is their index within the file's object stream.
  for (let index = range.start; index < range.end && index < objects.length; index++) {
    const source = objects[index];
    if (isRiveCoreTypeDerivedFrom(source.typeKey, RIVE_CUBIC_INTERPOLATOR)) {
      interpolators.set(
        index,
        easeCubicBezier(
          readRiveNumber(source, RIVE_INTERPOLATOR_X1, 0.42),
          readRiveNumber(source, RIVE_INTERPOLATOR_Y1, 0),
          readRiveNumber(source, RIVE_INTERPOLATOR_X2, 0.58),
          readRiveNumber(source, RIVE_INTERPOLATOR_Y2, 1),
        ),
      );
      continue;
    }
    if (!isRiveCoreTypeDerivedFrom(source.typeKey, RIVE_ELASTIC_INTERPOLATOR)) continue;
    interpolators.set(index, toRiveElasticEasing(source));
  }
  return interpolators;
}

// The elastic curve states its own amplitude and period, so it maps onto the parameterized damped
// sine rather than the fixed-constant easeElastic, which would be a different curve wherever a file
// states anything but the constants that one hardcodes.
function toRiveElasticEasing(source: Readonly<RiveCoreObject>): EasingFunction {
  const amplitude = readRiveNumber(source, RIVE_INTERPOLATOR_AMPLITUDE, 1);
  const period = readRiveNumber(source, RIVE_INTERPOLATOR_PERIOD, RIVE_DEFAULT_ELASTIC_PERIOD);
  const easing = readRiveNumber(source, RIVE_INTERPOLATOR_EASING, RIVE_ELASTIC_EASE_OUT);
  if (easing === RIVE_ELASTIC_EASE_IN) return easeInDampedSine(amplitude, period);
  return easing === RIVE_ELASTIC_EASE_IN_OUT
    ? easeInOutDampedSine(amplitude, period)
    : easeOutDampedSine(amplitude, period);
}

// Only the transform properties bind through the shared display-object target. Animated geometry and
// paint — vertex positions, colours — need a format-owned mutable-content binder and are recorded as
// uncovered rather than mapped onto a property that does not mean the same thing.
function toRiveAnimationPath(propertyKey: number): Node2DAnimationPath | null {
  if (propertyKey === RIVE_X || propertyKey === RIVE_X_LEGACY) return 'X';
  if (propertyKey === RIVE_Y || propertyKey === RIVE_Y_LEGACY) return 'Y';
  if (propertyKey === RIVE_ROTATION) return 'Rotation';
  if (propertyKey === RIVE_SCALE_X) return 'ScaleX';
  if (propertyKey === RIVE_SCALE_Y) return 'ScaleY';
  if (propertyKey === RIVE_OPACITY) return 'Alpha';
  return null;
}

// Rive states rotation in radians and Node2D's authoring rotation is degrees; everything else
// already shares its unit.
function toRiveValueConversion(path: Node2DAnimationPath): (value: number) => number {
  return path === 'Rotation' ? (value) => value * RAD_TO_DEG : (value) => value;
}

function readRiveNumber(source: Readonly<RiveCoreObject>, key: number, fallback: number): number {
  const property = source.properties.find((candidate) => candidate.key === key);
  return property === undefined || typeof property.value !== 'number' ? fallback : property.value;
}

function readRiveText(source: Readonly<RiveCoreObject>, key: number, fallback: string): string {
  const property = source.properties.find((candidate) => candidate.key === key);
  return property === undefined || typeof property.value !== 'string' ? fallback : property.value;
}

const RIVE_KEYED_OBJECT = 25;
const RIVE_KEYED_PROPERTY = 26;
const RIVE_KEYFRAME_DOUBLE = 30;
const RIVE_SHAPE_TYPE_KEY = 3;
const RIVE_LINEAR_ANIMATION = 31;
const RIVE_KEYFRAME_COLOR = 37;
const RIVE_CUBIC_INTERPOLATOR = 139;
const RIVE_ELASTIC_INTERPOLATOR = 174;
const RIVE_INTERPOLATING_KEYFRAME = 170;

const RIVE_X_LEGACY = 9;
const RIVE_Y_LEGACY = 10;
const RIVE_X = 13;
const RIVE_Y = 14;
const RIVE_ROTATION = 15;
const RIVE_SCALE_X = 16;
const RIVE_SCALE_Y = 17;
const RIVE_OPACITY = 18;

const RIVE_KEYED_OBJECT_ID = 51;
const RIVE_KEYED_PROPERTY_KEY = 53;
const RIVE_ANIMATION_NAME = 55;
const RIVE_ANIMATION_FPS = 56;
const RIVE_ANIMATION_DURATION = 57;
const RIVE_ANIMATION_SPEED = 58;
const RIVE_ANIMATION_LOOP = 59;
const RIVE_ANIMATION_WORK_START = 60;
const RIVE_ANIMATION_WORK_END = 61;
const RIVE_ANIMATION_ENABLE_WORK_AREA = 62;
const RIVE_INTERPOLATOR_X1 = 63;
const RIVE_INTERPOLATOR_Y1 = 64;
const RIVE_INTERPOLATOR_X2 = 65;
const RIVE_INTERPOLATOR_Y2 = 66;
const RIVE_KEYFRAME_FRAME = 67;
const RIVE_KEYFRAME_INTERPOLATION = 68;
const RIVE_KEYFRAME_INTERPOLATOR_ID = 69;
const RIVE_KEYFRAME_DOUBLE_VALUE = 70;
const RIVE_KEYFRAME_COLOR_VALUE = 88;
const RIVE_INTERPOLATOR_EASING = 405;
const RIVE_INTERPOLATOR_AMPLITUDE = 406;
const RIVE_INTERPOLATOR_PERIOD = 407;

const RIVE_LOOP_ONE_SHOT = 0;
const RIVE_LOOP_LOOP = 1;
const RIVE_LOOP_PING_PONG = 2;
// The work area's unset sentinel; 0 is a real frame, so absence cannot be spelled with it.
const RIVE_UNSET_FRAME = -1;

// Rive's Easing enum, and the property's own initial value is easeOut rather than easeIn.
const RIVE_ELASTIC_EASE_IN = 0;
const RIVE_ELASTIC_EASE_OUT = 1;
const RIVE_ELASTIC_EASE_IN_OUT = 2;
// The object model's initial period. A literal 0 is meaningless and the easing reads it as 0.5.
const RIVE_DEFAULT_ELASTIC_PERIOD = 1;

const RIVE_INTERPOLATION_HOLD = 0;
const RIVE_INTERPOLATION_LINEAR = 1;

const _holdEasing: EasingFunction = () => 0;
const _sampleScratch = new Array<number>(8).fill(0);
// Coalesces the rebuilds a single sample triggers, so a shape regenerates once however many of its
// vertices moved.
const _pendingRebuilds = new Set<() => void>();
