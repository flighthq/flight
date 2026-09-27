import {
  createAnimationChannel,
  createAnimationClip,
  createAnimationClipEvent,
  createAnimationTrack,
  sampleAnimationTrack,
} from '@flighthq/animation/contract';
import { createClipRegionFromPath } from '@flighthq/clip/contract';
import { easeCubicBezier } from '@flighthq/easing/contract';
import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { reportImportDiagnostic } from '@flighthq/importdiagnostics/contract';
import { addNodeChild, invalidateNodeLocalTransform } from '@flighthq/node/contract';
import { applyAnimationClipToNode2D, createDisplayObject } from '@flighthq/scene2d/contract';
import type {
  AnimationClip,
  AnimationTrack,
  DisplayObject,
  EasingFunction,
  EntityConstruction,
  ImportDiagnostic,
  LottieAdvancedBlend,
  LottieAnimatable,
  LottieBezierHandle,
  LottieDocument,
  LottieDocumentImportOptions,
  LottieDocumentImportResult,
  LottieImportContext,
  LottieKeyframe,
  LottieLayer,
  LottieMask,
  LottiePositionProperty,
  LottieRegistry,
  LottieShapePath,
  LottieTransform,
  Node2D,
  Node2DAnimationPath,
  Node2DAnimationTarget,
} from '@flighthq/types/contract';
import { AdvancedBlendMode, BlendMode, ImportDiagnosticSeverity } from '@flighthq/types/contract';

import {
  createLottieBezierPath,
  flattenLottieShapePath,
  toLottieShapePath,
  unflattenLottieShapePath,
} from './lottieBezierPath.ts';
import { getLottieLayerHandler } from './lottieRegistry.ts';

/**
 * The document core: JSON validation, import context, the ordered layer walk, and the animation plumbing every
 * feature shares.
 *
 * ★ WHAT IS NOT HERE IS THE POINT. Six layer interpretations and nine shape-item interpretations used to live in this
 * file; each now lives in the module that owns it, and this one keeps only what more than one of them needs — the
 * transform reader, the keyframe/track machinery, the numeric and colour conversions, and the diagnostic reports.
 * `createScene2DFromLottieDocumentWithRegistry` takes its handlers as an argument and names no default, so nothing
 * here reaches a preset.
 */
export function appendLottieLayers(
  root: DisplayObject,
  layers: readonly Readonly<LottieLayer>[],
  context: LottieImportContext,
): void {
  const nodes = new Map<number, DisplayObject>();
  const ordered: Array<{ layer: Readonly<LottieLayer>; node: DisplayObject }> = [];
  for (const layer of layers) {
    const node = createLottieLayerNode(layer, context);
    ordered.push({ layer, node });
    if (layer.ind !== undefined) nodes.set(layer.ind, node);
  }
  // Bodymovin stores the topmost layer first. Reverse insertion preserves that visual stacking in
  // Flight's back-to-front child order.
  for (let index = ordered.length - 1; index >= 0; index--) {
    const { layer, node } = ordered[index];
    const parent = layer.parent === undefined ? undefined : nodes.get(layer.parent);
    addNodeChild(parent ?? root, node);
  }
}

/**
 * Builds the animation channel a bezier path's keyframes drive.
 *
 * ★ THIS ONE STAYED IN THE CORE WHILE THE REST OF THE PATH ITEM MOVED OUT. It is animation plumbing: it reaches the
 * core's private track machinery and its private mutable-target interface, which is the boundary the core is meant
 * to own. The path item's own interpretation — the vertex reading, the flatten/unflatten pair and the bezier build —
 * lives in `lottiePathShapeItem.ts`, so a build without path items still skips all of that.
 */
export function appendLottieShapePathChannels(
  keyframes: readonly Readonly<LottieKeyframe<LottieShapePath>>[],
  current: number[],
  apply: () => void,
  context: LottieImportContext,
): void {
  if (keyframes.length === 0) return;
  if (
    keyframes.some((keyframe) => {
      const value = toLottieShapePath(keyframe.s ?? keyframe.e);
      return value !== undefined && flattenLottieShapePath(value).length !== current.length;
    })
  ) {
    reportLottieDrop(context, 'lottie.incompatible-animated-shape-path', 'appendLottieShapePathChannels');
    return;
  }
  const componentSpecific = hasComponentSpecificEasing(keyframes, current.length);
  if (componentSpecific) {
    for (let component = 0; component < current.length; component++) {
      context.channels.push(
        createAnimationChannel(
          createLottieTrack(
            keyframes,
            1,
            context,
            (value) => [
              flattenLottieShapePath(toLottieShapePath(value ?? keyframes[0].s)!)[component] ?? current[component],
            ],
            component,
          ),
          {
            lottieApply(sample) {
              current[component] = sample[0];
              apply();
            },
          } satisfies LottieMutableAnimationTarget,
        ),
      );
    }
    return;
  }
  context.channels.push(
    createAnimationChannel(
      createLottieTrack(
        keyframes,
        current.length,
        context,
        (value) => flattenLottieShapePath(toLottieShapePath(value ?? keyframes[0].s)!),
        0,
      ),
      {
        lottieApply(sample) {
          for (let index = 0; index < current.length; index++) current[index] = sample[index];
          apply();
        },
      } satisfies LottieMutableAnimationTarget,
    ),
  );
}

// Applies both the shared Node2DAnimationTarget channels and the format-owned mutable-content
// targets used by animated shape/paint/mask records.
export function applyAnimationClipToLottieDocument(clip: Readonly<AnimationClip>, time: number): void {
  applyAnimationClipToNode2D(clip, time);
  for (const channel of clip.channels) {
    const target = channel.targetRef as LottieMutableAnimationTarget | null;
    if (target === null || typeof target !== 'object' || target.lottieApply === undefined) continue;
    sampleAnimationTrack(_sampleScratch, channel.track, time);
    target.lottieApply(_sampleScratch, time);
  }
}

interface LottieMutableAnimationTarget {
  lottieApply(sample: Readonly<number[] | Float32Array>, time: number): void;
}

export function applyLottieTransform(
  target: Node2D,
  transform: Readonly<LottieTransform> | undefined,
  context: LottieImportContext,
  includeOpacity = true,
  autoOrient = false,
): void {
  if (transform === undefined) return;
  if (isSeparatedPosition(transform.p)) {
    applyScalarProperty(target, transform.p.x, 'X', (value) => value, context);
    applyScalarProperty(target, transform.p.y, 'Y', (value) => value, context);
  } else {
    applyVectorProperty(target, transform.p, 'Position', ['X', 'Y'], 2, (value) => value, context);
  }
  applyVectorProperty(target, transform.a, 'Pivot', ['PivotX', 'PivotY'], 2, (value) => value, context);
  applyVectorProperty(target, transform.s, 'Scale', ['ScaleX', 'ScaleY'], 2, (value) => value / 100, context);
  // Bodymovin states rotation and skew in degrees, and so does Flight's authoring transform, so both
  // pass through unconverted. The radians live below the seam, where nodeTransform2d applies
  // DEG_TO_RAD.
  applyScalarProperty(target, transform.r ?? transform.rz, 'Rotation', (value) => value, context);
  if (includeOpacity) applyScalarProperty(target, transform.o, 'Alpha', (value) => value / 100, context);
  if (transform.sk !== undefined) {
    applyScalarProperty(target, transform.sk, 'SkewX', (value) => value, context);
  }
  if (autoOrient) appendLottieAutoOrientation(target, transform.p, transform.r ?? transform.rz, context);
}

function createLottieLayerNode(layer: Readonly<LottieLayer>, context: LottieImportContext): DisplayObject {
  const container = createDisplayObject({ name: layer.nm ?? null });
  const hidden = layer.hd === true;
  // A hidden layer still contributes its spatial transform when another layer parents to it. Its
  // opacity, visibility window, paint, and masks affect only its own content, so none may leak onto
  // the referencing child through Flight's hierarchy.
  applyLottieTransform(container, layer.ks, context, !hidden, layer.ao === 1);
  reportLottieExpression(layer.ks, context);
  if (hidden) return container;
  applyLottieLayerVisibility(container, layer, context);
  applyLottieBlendMode(container, layer, context);

  const layerHandler = getLottieLayerHandler(context.registry, layer.ty);
  if (layerHandler !== null) {
    layerHandler({ container, import: context, layer });
  } else if (layer.ty !== 6 && layer.ty !== 13) {
    reportLottieSkip(context, 'lottie.unsupported-layer', 'createLottieLayerNode', { layerType: layer.ty });
  }

  applyLottieMasks(container, layer.masksProperties ?? [], context);
  return container;
}

export function bindMutableLottieNumericProperty<T>(
  property: Readonly<LottieAnimatable<T>>,
  current: number[],
  convert: (value: number, component: number) => number,
  onChange: () => void,
  context: LottieImportContext,
): void {
  if (!isAnimatedLottieProperty(property)) return;
  appendNumericPropertyChannels(
    property,
    current.length,
    (component) =>
      ({
        lottieApply(sample) {
          if (component === null) {
            for (let index = 0; index < current.length; index++) current[index] = sample[index];
          } else {
            current[component] = sample[0];
          }
          onChange();
        },
      }) satisfies LottieMutableAnimationTarget,
    convert,
    context,
  );
}

function applyVectorProperty(
  target: Node2D,
  property: Readonly<LottieAnimatable<number[]>> | undefined,
  vectorPath: Node2DAnimationPath,
  scalarPaths: readonly Node2DAnimationPath[],
  components: number,
  convert: (value: number, component: number) => number,
  context: LottieImportContext,
): void {
  if (property === undefined) return;
  const initial = lottieNumericValue(initialLottieValue(property), components).map(convert);
  applyDisplaySample(target, vectorPath, initial);
  if (!isAnimatedLottieProperty(property)) return;
  appendNumericPropertyChannels(
    property,
    components,
    (component) =>
      ({
        node: target,
        path: component === null ? vectorPath : scalarPaths[component],
      }) satisfies Node2DAnimationTarget,
    convert,
    context,
    vectorPath === 'Position',
  );
}

function applyScalarProperty(
  target: Node2D,
  property: Readonly<LottieAnimatable<number>> | undefined,
  path: Node2DAnimationPath,
  convert: (value: number) => number,
  context: LottieImportContext,
): void {
  if (property === undefined) return;
  applyDisplaySample(target, path, [convert(lottieNumericValue(initialLottieValue(property), 1)[0])]);
  if (!isAnimatedLottieProperty(property)) return;
  appendNumericPropertyChannels(
    property,
    1,
    () => ({ node: target, path }) satisfies Node2DAnimationTarget,
    convert,
    context,
  );
}

function appendNumericPropertyChannels<T>(
  property: Readonly<LottieAnimatable<T>>,
  components: number,
  target: (component: number | null) => unknown,
  convert: (value: number, component: number) => number,
  context: LottieImportContext,
  spatialTangents = false,
): void {
  if (!isAnimatedLottieProperty(property)) return;
  const keyframes = property.k;
  if (keyframes.length === 0) return;
  const spatial = spatialTangents && hasSpatialTangents(keyframes);
  const componentSpecific = !spatial && hasComponentSpecificEasing(keyframes, components);
  if (componentSpecific && components > 1) {
    for (let component = 0; component < components; component++) {
      context.channels.push(
        createAnimationChannel(
          createLottieTrack(
            keyframes,
            1,
            context,
            (value) => [convert(lottieNumericValue(value, components)[component], component)],
            component,
          ),
          target(component),
        ),
      );
    }
    return;
  }
  context.channels.push(
    createAnimationChannel(
      createLottieTrack(
        keyframes,
        components,
        context,
        (value) => lottieNumericValue(value, components).map(convert),
        0,
        spatial,
        (value, component) => convert(value, component) - convert(0, component),
      ),
      target(null),
    ),
  );
}

function appendLottieAutoOrientation(
  target: Node2D,
  property: Readonly<LottiePositionProperty> | undefined,
  rotation: Readonly<LottieAnimatable<number>> | undefined,
  context: LottieImportContext,
): void {
  const sampler = createLottiePositionSampler(property, context);
  if (sampler === null) return;
  const baseRotation = target.rotation;
  const rotationTrack =
    rotation !== undefined && isAnimatedLottieProperty(rotation)
      ? createLottieTrack(rotation.k, 1, context, (value) => lottieNumericValue(value, 1), 0)
      : null;
  const previous = [0, 0];
  const current = [0, 0];
  const frameStep = Math.abs(context.frameScale) / context.document.fr;

  const applyOrientation = (time: number): void => {
    let previousTime: number;
    let currentTime: number;
    if (time <= sampler.firstTime) {
      previousTime = sampler.firstTime;
      currentTime = sampler.firstTime + frameStep * 0.01;
    } else if (time >= sampler.lastTime) {
      previousTime = sampler.lastTime - frameStep * (sampler.separated ? 0.01 : 0.05);
      currentTime = sampler.lastTime;
    } else {
      previousTime = time - frameStep * 0.01;
      currentTime = time;
    }
    sampler.sample(previous, previousTime);
    sampler.sample(current, currentTime);
    const orientation = (Math.atan2(current[1] - previous[1], current[0] - previous[0]) * 180) / Math.PI;
    if (rotationTrack !== null) sampleAnimationTrack(_autoOrientRotationScratch, rotationTrack, time);
    target.rotation = (rotationTrack === null ? baseRotation : _autoOrientRotationScratch[0]) + orientation;
    invalidateNodeLocalTransform(target);
  };

  applyOrientation(sampler.firstTime);
  context.channels.push(
    createAnimationChannel(sampler.carrier, {
      lottieApply(_sample, time) {
        applyOrientation(time);
      },
    } satisfies LottieMutableAnimationTarget),
  );
}

interface LottiePositionSampler {
  carrier: AnimationTrack;
  firstTime: number;
  lastTime: number;
  sample(out: number[], time: number): void;
  separated: boolean;
}

function createLottiePositionSampler(
  property: Readonly<LottiePositionProperty> | undefined,
  context: LottieImportContext,
): LottiePositionSampler | null {
  if (property === undefined) return null;
  if (isSeparatedPosition(property)) {
    const xTrack = isAnimatedLottieProperty(property.x)
      ? createLottieTrack(property.x.k, 1, context, (value) => lottieNumericValue(value, 1), 0)
      : null;
    const yTrack = isAnimatedLottieProperty(property.y)
      ? createLottieTrack(property.y.k, 1, context, (value) => lottieNumericValue(value, 1), 0)
      : null;
    const carrier = xTrack ?? yTrack;
    if (carrier === null) return null;
    const x = lottieNumericValue(initialLottieValue(property.x), 1)[0];
    const y = lottieNumericValue(initialLottieValue(property.y), 1)[0];
    const tracks = [xTrack, yTrack].filter(
      (track): track is AnimationTrack => track !== null && track.times.length > 0,
    );
    if (tracks.length === 0) return null;
    return {
      carrier,
      firstTime: Math.min(...tracks.map((track) => track.times[0])),
      lastTime: Math.max(...tracks.map((track) => track.times[track.times.length - 1])),
      sample(out, time) {
        out[0] = x;
        out[1] = y;
        if (xTrack !== null) sampleAnimationTrack(out, xTrack, time);
        if (yTrack !== null) {
          sampleAnimationTrack(_autoOrientScalarScratch, yTrack, time);
          out[1] = _autoOrientScalarScratch[0];
        }
      },
      separated: true,
    };
  }
  if (!isAnimatedLottieProperty(property)) return null;
  const track = createLottieTrack(
    property.k,
    2,
    context,
    (value) => lottieNumericValue(value, 2),
    0,
    hasSpatialTangents(property.k),
  );
  if (track.times.length === 0) return null;
  return {
    carrier: track,
    firstTime: track.times[0],
    lastTime: track.times[track.times.length - 1],
    sample(out, time) {
      sampleAnimationTrack(out, track, time);
    },
    separated: false,
  };
}

function createLottieTrack<T>(
  keyframes: readonly Readonly<LottieKeyframe<T>>[],
  components: number,
  context: LottieImportContext,
  valueOf: (value: T | undefined, keyframe: number) => number[],
  easingComponent: number,
  spatialTangents = false,
  tangentOf: (value: number, component: number) => number = (value) => value,
): AnimationTrack {
  const times: number[] = [];
  const samples: number[][] = [];
  const retained: Array<Readonly<LottieKeyframe<T>>> = [];
  for (let index = 0; index < keyframes.length; index++) {
    const keyframe = keyframes[index];
    const time = frameToSeconds(keyframe.t, context);
    if (times.length > 0 && time <= times[times.length - 1]) continue;
    times.push(time);
    retained.push(keyframe);
    const source = keyframe.s ?? keyframes[index - 1]?.e;
    samples.push(valueOf(source, index));
  }
  const spatial = spatialTangents && hasSpatialTangents(retained);
  const values = spatial
    ? createLottieSpatialTrackValues(retained, samples, times, components, tangentOf)
    : samples.flat();
  const segmentEasings: Array<EasingFunction | null> = [];
  for (let index = 0; index < retained.length - 1; index++) {
    const keyframe = retained[index];
    const temporal =
      keyframe.h === 1 ? _holdEasing : createLottieSegmentEasing(keyframe.o, keyframe.i, easingComponent);
    const outgoing = spatialTangent(keyframe.to, components, tangentOf);
    const incoming = spatialTangent(keyframe.ti, components, tangentOf);
    segmentEasings.push(
      spatial && outgoing !== null && incoming !== null
        ? createLottieSpatialSegmentEasing(temporal, samples[index], samples[index + 1], outgoing, incoming)
        : temporal,
    );
  }
  return createAnimationTrack({
    components,
    interpolation: spatial ? 'Cubic' : 'Linear',
    segmentEasings,
    times,
    values,
  });
}

function createLottieSpatialTrackValues<T>(
  keyframes: readonly Readonly<LottieKeyframe<T>>[],
  samples: readonly number[][],
  times: readonly number[],
  components: number,
  tangentOf: (value: number, component: number) => number,
): number[] {
  const incoming = samples.map(() => new Array<number>(components).fill(0));
  const outgoing = samples.map(() => new Array<number>(components).fill(0));
  for (let index = 0; index < samples.length - 1; index++) {
    const dt = times[index + 1] - times[index];
    const spatialOut = spatialTangent(keyframes[index].to, components, tangentOf);
    const spatialIn = spatialTangent(keyframes[index].ti, components, tangentOf);
    for (let component = 0; component < components; component++) {
      if (spatialOut !== null && spatialIn !== null) {
        outgoing[index][component] = (3 * spatialOut[component]) / dt;
        incoming[index + 1][component] = (-3 * spatialIn[component]) / dt;
      } else {
        const slope = (samples[index + 1][component] - samples[index][component]) / dt;
        outgoing[index][component] = slope;
        incoming[index + 1][component] = slope;
      }
    }
  }
  const values: number[] = [];
  for (let index = 0; index < samples.length; index++) {
    values.push(...incoming[index], ...samples[index], ...outgoing[index]);
  }
  return values;
}

function spatialTangent(
  value: readonly number[] | undefined,
  components: number,
  tangentOf: (value: number, component: number) => number,
): number[] | null {
  if (!Array.isArray(value)) return null;
  return lottieNumericValue(value, components).map(tangentOf);
}

const LOTTIE_SPATIAL_CURVE_SAMPLES = 150;

function createLottieSpatialSegmentEasing(
  temporal: EasingFunction | null,
  start: readonly number[],
  end: readonly number[],
  outgoing: readonly number[],
  incoming: readonly number[],
): EasingFunction {
  const lengths = new Array<number>(LOTTIE_SPATIAL_CURVE_SAMPLES).fill(0);
  let previous = start;
  for (let index = 1; index < LOTTIE_SPATIAL_CURVE_SAMPLES; index++) {
    const point = sampleLottieSpatialBezier(start, end, outgoing, incoming, index / (LOTTIE_SPATIAL_CURVE_SAMPLES - 1));
    let distanceSquared = 0;
    for (let component = 0; component < start.length; component++) {
      distanceSquared += (point[component] - previous[component]) ** 2;
    }
    lengths[index] = lengths[index - 1] + Math.sqrt(distanceSquared);
    previous = point;
  }
  const total = lengths[lengths.length - 1];
  return (alpha) => {
    const distanceFraction = temporal?.(alpha) ?? alpha;
    if (distanceFraction <= 0 || total === 0) return 0;
    if (distanceFraction >= 1) return 1;
    const distance = total * distanceFraction;
    let low = 0;
    let high = lengths.length - 1;
    while (low + 1 < high) {
      const middle = (low + high) >> 1;
      if (lengths[middle] <= distance) low = middle;
      else high = middle;
    }
    const span = lengths[high] - lengths[low];
    const fraction = span > 0 ? (distance - lengths[low]) / span : 0;
    return (low + fraction) / (LOTTIE_SPATIAL_CURVE_SAMPLES - 1);
  };
}

function sampleLottieSpatialBezier(
  start: readonly number[],
  end: readonly number[],
  outgoing: readonly number[],
  incoming: readonly number[],
  time: number,
): number[] {
  const inverse = 1 - time;
  return start.map(
    (value, component) =>
      inverse ** 3 * value +
      3 * inverse ** 2 * time * (value + outgoing[component]) +
      3 * inverse * time ** 2 * (end[component] + incoming[component]) +
      time ** 3 * end[component],
  );
}

function createLottieSegmentEasing(
  outgoing: Readonly<LottieBezierHandle> | undefined,
  incoming: Readonly<LottieBezierHandle> | undefined,
  component: number,
): EasingFunction | null {
  if (outgoing === undefined || incoming === undefined) return null;
  return easeCubicBezier(
    handleComponent(outgoing.x, component),
    handleComponent(outgoing.y, component),
    handleComponent(incoming.x, component),
    handleComponent(incoming.y, component),
  );
}

/**
 * The Lottie import, over a handler registry it is GIVEN rather than one it resolves.
 *
 * ★ THIS MODULE MUST NOT KNOW THE DEFAULT FAMILY. `createScene2DFromLottieDocument` in `lottieImport.ts` owns that
 * edge, which is what keeps this module free of the fifteen feature modules and of the path, text and image code
 * behind them. A `?? _defaultLayerHandlers()` here would name every handler from the orchestrator, and a caller
 * asking for null and solid layers alone would link all of it anyway — the property the registry exists to provide.
 *
 * Everything else is unchanged: JSON validation and its reject diagnostic, the context, the layer walk, the marker
 * events, and the clip the result carries.
 */
/**
 * Imports a Bodymovin/Lottie document into a display subtree and target-bound AnimationClip.
 * Playback remains explicit: call applyAnimationClipToLottieDocument with the returned clip.
 */
export function createScene2DFromLottieDocumentWithRegistry(
  source: string | Readonly<LottieDocument>,
  registry: Readonly<LottieRegistry>,
  diagnostics?: ImportDiagnostic[],
  options?: Readonly<LottieDocumentImportOptions>,
): LottieDocumentImportResult {
  const document = parseLottieDocument(source);
  const root = createDisplayObject();
  if (document === null || !isValidLottieDocument(document)) {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Reject,
      'lottie.invalid-document',
      'createScene2DFromLottieDocument',
    );
    const out = allocateEntity<LottieDocumentImportResult>();
    initializeLottieDocumentImportResult(out, root, [], createAnimationClip([]), 0, 0);
    return finishEntity(out);
  }

  const context: LottieImportContext = {
    advancedBlends: [],
    assets: new Map((document.assets ?? []).map((asset) => [asset.id, asset])),
    channels: [],
    diagnostics,
    document,
    frameOffset: 0,
    frameScale: 1,
    registry,
    resolveImageResource: options?.resolveImageResource,
    resolvingPrecompositions: new Set(),
  };
  appendLottieLayers(root, document.layers, context);
  const duration = Math.max(0, (document.op - document.ip) / document.fr);
  const events = (document.markers ?? []).map((marker) =>
    createAnimationClipEvent(lottieClamp((marker.tm - document.ip) / document.fr, 0, duration), marker.cm, {
      duration: marker.dr / document.fr,
    }),
  );
  const out = allocateEntity<LottieDocumentImportResult>();
  initializeLottieDocumentImportResult(
    out,
    root,
    context.advancedBlends,
    createAnimationClip(context.channels, duration, events),
    duration,
    document.fr,
  );
  return finishEntity(out);
}

export function initializeLottieDocumentImportResult(
  out: EntityConstruction<LottieDocumentImportResult>,
  root: DisplayObject,
  advancedBlends: LottieAdvancedBlend[],
  clip: AnimationClip,
  duration: number,
  frameRate: number,
): void {
  out.advancedBlends = advancedBlends;
  out.clip = clip;
  out.duration = duration;
  out.frameRate = frameRate;
  out.root = root;
}

export function initialLottieValue<T>(property: Readonly<LottieAnimatable<T>> | undefined): T | undefined {
  if (property === undefined) return undefined;
  if (!isAnimatedLottieProperty(property)) return property.k;
  return property.k[0]?.s ?? property.k[0]?.e;
}

/**
 * Whether a property carries keyframes, decided by its **structure** rather than its `a` flag.
 *
 * Real Bodymovin exports routinely omit `a` on animated properties — across a corpus of eighteen,
 * 2,714 keyframed properties state no flag against 730 that do. Trusting the flag reads those as
 * static and hands the caller the raw keyframe array as if it were a value, which yields nonsense
 * for a number and no `v` at all for a shape path.
 *
 * The structure is unambiguous: a keyframe list holds objects that state a frame `t`, where a static
 * value is a number, an array of numbers, or a bare path object.
 */
export function isAnimatedLottieProperty<T>(
  property: Readonly<LottieAnimatable<T>>,
): property is Readonly<{ a: 1; k: LottieKeyframe<T>[]; x?: string }> {
  if (!Array.isArray(property.k) || property.k.length === 0) return false;
  const first: unknown = property.k[0];
  return typeof first === 'object' && first !== null && 't' in (first as Record<string, unknown>);
}

export function lottieClamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function lottieDegreesToRadians(value: number): number {
  return (value * Math.PI) / 180;
}

/**
 * Lowers a layer's masks onto Flight's hard clip region.
 *
 * ★ THE ONE FEATURE STILL READ FOR EVERY LAYER, and therefore the one that keeps bezier-path reading in every bundle.
 * Masks belong to no layer kind — a null, image, text or shape layer may carry them — so the core's walk has to ask,
 * and asking links `lottieBezierPath`. Breaking that would need masks to become a registered family of their own
 * rather than a step in the walk; until then a null-layer-only build still pays for the mask reader.
 */
function applyLottieMasks(target: Node2D, masks: readonly Readonly<LottieMask>[], context: LottieImportContext): void {
  const active = masks.filter((mask) => mask.mode !== 'n');
  if (active.length === 0) return;
  const first = active[0];
  // Only a lone additive, non-inverted mask lowers onto Flight's hard ClipRegion. Composed modes,
  // inversion, and feather are uncarried; see agents/scene2d-format-coverage.md.
  if (first.mode !== 'a' || first.inv === true || active.length > 1) return;
  const initial = toLottieShapePath(initialLottieValue(first.pt));
  if (initial === undefined) return;
  target.clip = createClipRegionFromPath(createLottieBezierPath(initial));
  if (isAnimatedLottieProperty(first.pt)) {
    const current = flattenLottieShapePath(initial);
    appendLottieShapePathChannels(
      first.pt.k,
      current,
      () => {
        target.clip = createClipRegionFromPath(createLottieBezierPath(unflattenLottieShapePath(initial, current)));
      },
      context,
    );
  }
}

function applyLottieLayerVisibility(target: Node2D, layer: Readonly<LottieLayer>, context: LottieImportContext): void {
  const start = frameToSeconds(layer.ip ?? context.document.ip, context);
  const end = frameToSeconds(layer.op ?? context.document.op, context);
  target.visible = start <= 0 && end > 0;
  const duration = Math.max(0, (context.document.op - context.document.ip) / context.document.fr);
  const times = [0, lottieClamp(start, 0, duration), lottieClamp(end, 0, duration), duration].filter(
    (time, index, all) => index === 0 || time > all[index - 1],
  );
  if (times.length < 2) return;
  const values = times.map((time) => (time >= start && time < end ? 1 : 0));
  context.channels.push(
    createAnimationChannel(createAnimationTrack({ interpolation: 'Step', times, values }), {
      node: target,
      path: 'Visible',
    } satisfies Node2DAnimationTarget),
  );
}

/**
 * Splits a layer's blend mode across Flight's two tiers.
 *
 * `BlendMode` is the fixed-function set that folds into blend state; the destination-reading and
 * non-separable modes are `AdvancedBlendMode`, realized through a `BlendEffect` the caller applies.
 * Neither tier is a place to guess: Bodymovin numbers overlay as 3, darken as 4 and lighten as 5, and
 * an earlier reading of this table put Add at 3 and darken/lighten at 8 and 9 — so an overlay layer
 * rendered as additive while the two modes Flight can express fell through unmapped.
 */
function applyLottieBlendMode(target: Node2D, layer: Readonly<LottieLayer>, context: LottieImportContext): void {
  const mode = layer.bm ?? 0;
  const fixed = _lottieFixedBlendModes.get(mode);
  if (fixed !== undefined) {
    target.blendMode = fixed;
    return;
  }
  target.blendMode = BlendMode.Normal;
  const advanced = _lottieAdvancedBlendModes.get(mode);
  if (advanced !== undefined) context.advancedBlends.push({ mode: advanced, node: target });
}

export function lottieNumericValue(value: unknown, components: number): number[] {
  const source = Array.isArray(value) ? value : [value];
  const out = new Array<number>(components);
  for (let index = 0; index < components; index++) {
    const candidate = Number(source[index] ?? source[0] ?? 0);
    out[index] = Number.isFinite(candidate) ? candidate : 0;
  }
  return out;
}

function applyDisplaySample(target: Node2D, path: Node2DAnimationPath, sample: readonly number[]): void {
  if (path === 'Position') {
    target.x = sample[0];
    target.y = sample[1];
  } else if (path === 'X') target.x = sample[0];
  else if (path === 'Y') target.y = sample[0];
  else if (path === 'Pivot') {
    target.pivotX = sample[0];
    target.pivotY = sample[1];
  } else if (path === 'PivotX') target.pivotX = sample[0];
  else if (path === 'PivotY') target.pivotY = sample[0];
  else if (path === 'Scale') {
    target.scaleX = sample[0];
    target.scaleY = sample[1];
  } else if (path === 'ScaleX') target.scaleX = sample[0];
  else if (path === 'ScaleY') target.scaleY = sample[0];
  else if (path === 'Rotation') target.rotation = sample[0];
  else if (path === 'SkewX') target.skewX = sample[0];
  else if (path === 'Alpha') target.alpha = sample[0];
}

function parseLottieDocument(source: string | Readonly<LottieDocument>): Readonly<LottieDocument> | null {
  if (typeof source !== 'string') return source;
  try {
    return JSON.parse(source) as LottieDocument;
  } catch {
    return null;
  }
}

function isValidLottieDocument(document: Readonly<LottieDocument>): boolean {
  return (
    Number.isFinite(document.fr) &&
    document.fr > 0 &&
    Number.isFinite(document.ip) &&
    Number.isFinite(document.op) &&
    document.op >= document.ip &&
    Number.isFinite(document.w) &&
    Number.isFinite(document.h) &&
    Array.isArray(document.layers)
  );
}

export function lottieRgba(color: readonly number[]): number {
  return (
    ((Math.round(lottieClamp(color[0] ?? 0, 0, 1) * 255) << 24) |
      (Math.round(lottieClamp(color[1] ?? 0, 0, 1) * 255) << 16) |
      (Math.round(lottieClamp(color[2] ?? 0, 0, 1) * 255) << 8) |
      0xff) >>>
    0
  );
}

function isSeparatedPosition(property: Readonly<LottiePositionProperty> | undefined): property is Readonly<{
  s: true;
  x: LottieAnimatable<number>;
  y: LottieAnimatable<number>;
  z?: LottieAnimatable<number>;
}> {
  return property !== undefined && 's' in property && property.s === true && 'x' in property && 'y' in property;
}

function hasComponentSpecificEasing<T>(keyframes: readonly Readonly<LottieKeyframe<T>>[], components: number): boolean {
  if (components < 2) return false;
  for (let index = 0; index < keyframes.length - 1; index++) {
    const current = keyframes[index];
    for (const handle of [current.o, current.i]) {
      if (handle === undefined) continue;
      if (handleVaries(handle.x, components) || handleVaries(handle.y, components)) return true;
    }
  }
  return false;
}

function hasSpatialTangents<T>(keyframes: readonly Readonly<LottieKeyframe<T>>[]): boolean {
  return keyframes.some((keyframe, index) => {
    return index < keyframes.length - 1 && Array.isArray(keyframe.to) && Array.isArray(keyframe.ti);
  });
}

function handleVaries(value: number | number[], components: number): boolean {
  if (!Array.isArray(value) || value.length < 2) return false;
  for (let index = 1; index < components; index++) {
    if ((value[index] ?? value[0]) !== value[0]) return true;
  }
  return false;
}

function handleComponent(value: number | number[], component: number): number {
  return Array.isArray(value) ? (value[component] ?? value[0] ?? 0) : value;
}

function frameToSeconds(frame: number, context: Readonly<LottieImportContext>): number {
  return (context.frameOffset + frame * context.frameScale - context.document.ip) / context.document.fr;
}

export function reportLottieDrop(
  context: Readonly<LottieImportContext>,
  kind: string,
  origin: string,
  detail?: Record<string, string | number>,
): void {
  reportImportDiagnostic(context.diagnostics, ImportDiagnosticSeverity.Drop, kind, origin, detail);
}

const _sampleScratch = new Array<number>(256).fill(0);
const _autoOrientRotationScratch = [0];
const _autoOrientScalarScratch = [0];
const _holdEasing: EasingFunction = () => 0;

// Bodymovin's own numbering. The five that fold into blend state:
const _lottieFixedBlendModes = new Map<number, string>([
  [0, BlendMode.Normal],
  [1, BlendMode.Multiply],
  [2, BlendMode.Screen],
  [4, BlendMode.Darken],
  [5, BlendMode.Lighten],
]);

// The eleven that must bounce through an offscreen.
const _lottieAdvancedBlendModes = new Map<number, string>([
  [3, AdvancedBlendMode.Overlay],
  [6, AdvancedBlendMode.ColorDodge],
  [7, AdvancedBlendMode.ColorBurn],
  [8, AdvancedBlendMode.HardLight],
  [9, AdvancedBlendMode.SoftLight],
  [10, AdvancedBlendMode.Difference],
  [11, AdvancedBlendMode.Exclusion],
  [12, AdvancedBlendMode.Hue],
  [13, AdvancedBlendMode.Saturation],
  [14, AdvancedBlendMode.Color],
  [15, AdvancedBlendMode.Luminosity],
]);

export function reportLottieExpression(value: unknown, context: LottieImportContext): void {
  if (value === null || typeof value !== 'object') return;
  if ('x' in value && typeof value.x === 'string') {
    reportLottieSkip(context, 'lottie.unsupported-expression', 'reportLottieExpression');
  }
  for (const child of Object.values(value)) {
    if (child !== value) reportLottieExpression(child, context);
  }
}

export function reportLottieSkip(
  context: Readonly<LottieImportContext>,
  kind: string,
  origin: string,
  detail?: Record<string, string | number>,
): void {
  reportImportDiagnostic(context.diagnostics, ImportDiagnosticSeverity.Skip, kind, origin, detail);
}
