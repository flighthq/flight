import {
  createAnimationChannel,
  createAnimationClip,
  createAnimationTrack,
  sampleAnimationTrack,
} from '@flighthq/animation/contract';
import { easeCubicBezier } from '@flighthq/easing/contract';
import { RAD_TO_DEG } from '@flighthq/math/contract';
import { applyAnimationClipToNode2D } from '@flighthq/scene2d/contract';
import { RiveFieldType } from '@flighthq/types/contract';
import type {
  AnimationChannel,
  AnimationClip,
  RiveArtboardGraph,
  RiveAnimationClip,
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
    target.riveApply(_sampleScratch[0]);
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
): RiveAnimationClip[] {
  const interpolators = collectRiveInterpolators(objects, range);
  const clips: RiveAnimationClip[] = [];
  for (let index = range.start; index < range.end; index++) {
    if (objects[index].typeKey !== RIVE_LINEAR_ANIMATION) continue;
    clips.push(createRiveAnimationClip(objects, index, range.end, nodes, interpolators, artboard, rebuilds));
  }
  return clips;
}

interface RiveMutableTarget {
  riveApply(value: number): void;
}

function createRiveAnimationClip(
  objects: readonly Readonly<RiveCoreObject>[],
  start: number,
  limit: number,
  nodes: ReadonlyArray<DisplayObject | null>,
  interpolators: ReadonlyMap<number, EasingFunction>,
  artboard: Readonly<RiveArtboardGraph>,
  rebuilds: ReadonlyMap<number, () => void>,
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
    const target = createRiveMutableTarget(artboard, rebuilds, keyedIndex, propertyKey);
    if (target === null) continue;
    const channel = createRiveChannel(objects, index, limit, fps, interpolators, (value) => value, target);
    if (channel !== null) channels.push(channel);
  }

  const duration = readRiveNumber(source, RIVE_ANIMATION_DURATION, 60) / fps;
  return { clip: createAnimationClip(channels, duration), name: readRiveText(source, RIVE_ANIMATION_NAME, '') };
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
  const times: number[] = [];
  const values: number[] = [];
  const segmentEasings: Array<EasingFunction | null> = [];

  for (let index = propertyIndex + 1; index < limit; index++) {
    const object = objects[index];
    if (!isRiveCoreTypeDerivedFrom(object.typeKey, RIVE_INTERPOLATING_KEYFRAME)) break;
    const time = readRiveNumber(object, RIVE_KEYFRAME_FRAME, 0) / fps;
    // A repeated frame would give the track two samples at one time; the first one wins.
    if (times.length > 0 && time <= times[times.length - 1]) continue;
    times.push(time);
    values.push(convert(readRiveNumber(object, RIVE_KEYFRAME_VALUE, 0)));
    // A keyframe's interpolation governs the segment that LEAVES it, so the last one contributes none.
    segmentEasings.push(toRiveSegmentEasing(object, interpolators));
  }
  if (times.length === 0) return null;
  segmentEasings.pop();

  return createAnimationChannel(
    createAnimationTrack({ interpolation: 'Linear', segmentEasings, times, values }),
    targetRef,
  );
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
): RiveMutableTarget | null {
  if (objectIndex < 0 || objectIndex >= artboard.objects.length || propertyKey < 0) return null;
  const object = artboard.objects[objectIndex];
  const rebuild = rebuilds.get(findRiveShapeOwner(artboard, objectIndex));
  if (rebuild === undefined) return null;

  const property = object.properties.find((candidate) => candidate.key === propertyKey);
  // A file may key a property it never states, in which case the value starts at the format default.
  const slot = property ?? { key: propertyKey, type: RiveFieldType.Double, value: 0 };
  if (property === undefined) object.properties.push(slot);

  return {
    riveApply(value: number): void {
      slot.value = value;
      _pendingRebuilds.add(rebuild);
    },
  };
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

// Established from the corpus rather than a header: type 2 carries an interpolator in 18,044 of
// 18,608 cases while type 1 never does and type 0 almost never, which is hold / linear / cubic. The
// advanced kinds (3 and 4, 42 cases) have no Flight equivalent and fall back to linear.
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

function collectRiveInterpolators(
  objects: readonly Readonly<RiveCoreObject>[],
  range: Readonly<{ end: number; start: number }>,
): Map<number, EasingFunction> {
  const interpolators = new Map<number, EasingFunction>();
  // An interpolator is addressed by its position in the artboard's own numbering, which for these
  // non-component objects is their index within the file's object stream.
  for (let index = 0; index < objects.length; index++) {
    if (!isRiveCoreTypeDerivedFrom(objects[index].typeKey, RIVE_CUBIC_INTERPOLATOR)) continue;
    if (index < range.start || index >= range.end) continue;
    const source = objects[index];
    interpolators.set(
      index,
      easeCubicBezier(
        readRiveNumber(source, RIVE_INTERPOLATOR_X1, 0.42),
        readRiveNumber(source, RIVE_INTERPOLATOR_Y1, 0),
        readRiveNumber(source, RIVE_INTERPOLATOR_X2, 0.58),
        readRiveNumber(source, RIVE_INTERPOLATOR_Y2, 1),
      ),
    );
  }
  return interpolators;
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
const RIVE_SHAPE_TYPE_KEY = 3;
const RIVE_LINEAR_ANIMATION = 31;
const RIVE_CUBIC_INTERPOLATOR = 139;
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
const RIVE_INTERPOLATOR_X1 = 63;
const RIVE_INTERPOLATOR_Y1 = 64;
const RIVE_INTERPOLATOR_X2 = 65;
const RIVE_INTERPOLATOR_Y2 = 66;
const RIVE_KEYFRAME_FRAME = 67;
const RIVE_KEYFRAME_INTERPOLATION = 68;
const RIVE_KEYFRAME_INTERPOLATOR_ID = 69;
const RIVE_KEYFRAME_VALUE = 70;

const RIVE_INTERPOLATION_HOLD = 0;
const RIVE_INTERPOLATION_LINEAR = 1;

const _holdEasing: EasingFunction = () => 0;
const _sampleScratch = new Array<number>(8).fill(0);
// Coalesces the rebuilds a single sample triggers, so a shape regenerates once however many of its
// vertices moved.
const _pendingRebuilds = new Set<() => void>();
