import {
  createAnimationChannel,
  createAnimationClip,
  createAnimationClipEvent,
  createAnimationTrack,
  sampleAnimationTrack,
} from '@flighthq/animation/contract';
import { createClipRegionFromPath } from '@flighthq/clip/contract';
import { packColor } from '@flighthq/color/contract';
import { easeCubicBezier } from '@flighthq/easing/contract';
import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { createGradientTransformMatrix } from '@flighthq/geometry/contract';
import { reportImportDiagnostic } from '@flighthq/importdiagnostics/contract';
import { addNodeChild, invalidateNodeLocalTransform } from '@flighthq/node/contract';
import {
  appendPathCubicCurveTo,
  appendPathEllipse,
  appendPathLineTo,
  appendPathMoveTo,
  appendPathPolygon,
  appendPathRectangle,
  appendPathRoundRectangle,
  createPath,
  dashPath,
  getPathLength,
  reversePath,
} from '@flighthq/path/contract';
import { applyAnimationClipToNode2D, createSprite, createDisplayObject } from '@flighthq/scene2d/contract';
import {
  appendShapeBeginFill,
  appendShapeBeginGradientFill,
  appendShapeEndFill,
  appendShapeLineGradientStyle,
  appendShapeLineStyle,
  appendShapePath,
  clearShapeCommands,
  createShape,
} from '@flighthq/shape/contract';
import { createTextLabel } from '@flighthq/text/contract';
import { createTexture } from '@flighthq/texture/contract';
import type {
  AnimationChannel,
  AnimationClip,
  AnimationTrack,
  DisplayObject,
  EasingFunction,
  ImportDiagnostic,
  LottieAdvancedBlend,
  LottieAnimatable,
  LottieAsset,
  LottieBezierHandle,
  LottieDocument,
  LottieDocumentImportOptions,
  LottieDocumentImportResult,
  LottieEllipseShapeItem,
  LottieFillShapeItem,
  LottieGradientShapeItem,
  LottieImageAsset,
  LottieKeyframe,
  LottieLayer,
  LottieMask,
  LottiePolystarShapeItem,
  LottiePositionProperty,
  LottiePrecompositionAsset,
  LottieRectangleShapeItem,
  LottieShapeGroup,
  LottieShapeItem,
  LottieShapePath,
  LottieShapePathItem,
  LottieStrokeShapeItem,
  LottieTextDocument,
  LottieTransform,
  LottieTrimPathShapeItem,
  Node2D,
  Node2DAnimationPath,
  Node2DAnimationTarget,
  Path,
  Shape,
} from '@flighthq/types/contract';
import { AdvancedBlendMode, BlendMode, ImportDiagnosticSeverity } from '@flighthq/types/contract';

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

/**
 * Imports a Bodymovin/Lottie document into a display subtree and target-bound AnimationClip.
 * Playback remains explicit: call applyAnimationClipToLottieDocument with the returned clip.
 */
export function createScene2DFromLottieDocument(
  source: string | Readonly<LottieDocument>,
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
    out.advancedBlends = [];
    out.clip = createAnimationClip([]);
    out.duration = 0;
    out.frameRate = 0;
    out.root = root;
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
    options,
    resolvingPrecompositions: new Set(),
  };
  appendLottieLayers(root, document.layers, context);
  const duration = Math.max(0, (document.op - document.ip) / document.fr);
  const events = (document.markers ?? []).map((marker) =>
    createAnimationClipEvent(clamp((marker.tm - document.ip) / document.fr, 0, duration), marker.cm, {
      duration: marker.dr / document.fr,
    }),
  );
  const out = allocateEntity<LottieDocumentImportResult>();
  out.advancedBlends = context.advancedBlends;
  out.clip = createAnimationClip(context.channels, duration, events);
  out.duration = duration;
  out.frameRate = document.fr;
  out.root = root;
  return finishEntity(out);
}

interface LottieImportContext {
  advancedBlends: LottieAdvancedBlend[];
  assets: Map<string, LottieAsset>;
  channels: AnimationChannel[];
  diagnostics: ImportDiagnostic[] | undefined;
  document: Readonly<LottieDocument>;
  frameOffset: number;
  frameScale: number;
  options: Readonly<LottieDocumentImportOptions> | undefined;
  resolvingPrecompositions: Set<string>;
}

interface LottieMutableAnimationTarget {
  lottieApply(sample: Readonly<number[] | Float32Array>, time: number): void;
}

// A Bodymovin group carries a LIST of paints, not one of each: two fills are legal and each paints
// every path in the group. Keeping them ordered is what lets a second fill, or a gradient beside a
// solid one, survive instead of overwriting its predecessor.
type LottiePaint =
  | { color: number[]; kind: 'fill'; opacity: number; winding: 'evenOdd' | 'nonZero' }
  | {
      caps: 'none' | 'round' | 'square';
      color: number[];
      dash: number[];
      dashOffset: number;
      joints: 'bevel' | 'miter' | 'round';
      kind: 'stroke';
      miterLimit: number;
      opacity: number;
      width: number;
    }
  | {
      caps: 'none' | 'round' | 'square';
      count: number;
      dash: number[];
      dashOffset: number;
      end: number[];
      joints: 'bevel' | 'miter' | 'round';
      kind: 'gradient';
      miterLimit: number;
      opacity: number;
      shape: 1 | 2;
      start: number[];
      type: 'gf' | 'gs';
      values: number[];
      width: number;
      winding: 'evenOdd' | 'nonZero';
    };

type LottieGradientPaint = Extract<LottiePaint, { kind: 'gradient' }>;

interface LottieShapeState {
  paints: LottiePaint[];
  paths: Path[];
  shape: Shape;
}

function appendLottieLayers(
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

  if (layer.ty === 0) appendLottiePrecomposition(container, layer, context);
  else if (layer.ty === 1) appendLottieSolid(container, layer);
  else if (layer.ty === 2) appendLottieImage(container, layer, context);
  else if (layer.ty === 3) {
    // Null layers intentionally contain only their transform and children.
  } else if (layer.ty === 4) appendLottieShapeItems(container, layer.shapes ?? [], context);
  else if (layer.ty === 5) appendLottieText(container, layer, context);
  else if (layer.ty !== 6 && layer.ty !== 13) {
    // Audio (6) and camera (13) layers are uncarried by design and stay silent; a type outside the
    // Bodymovin set is an asset fact the caller can act on. See agents/scene2d-format-coverage.md.
    reportLottieSkip(context, 'lottie.unsupported-layer', 'createLottieLayerNode', { layerType: layer.ty });
  }

  applyLottieMasks(container, layer.masksProperties ?? [], context);
  return container;
}

function applyLottieTransform(
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
  const initial = numericValue(initialLottieValue(property), components).map(convert);
  applyDisplaySample(target, vectorPath, initial);
  if (!isAnimatedProperty(property)) return;
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
  applyDisplaySample(target, path, [convert(numericValue(initialLottieValue(property), 1)[0])]);
  if (!isAnimatedProperty(property)) return;
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
  if (!isAnimatedProperty(property)) return;
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
            (value) => [convert(numericValue(value, components)[component], component)],
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
        (value) => numericValue(value, components).map(convert),
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
    rotation !== undefined && isAnimatedProperty(rotation)
      ? createLottieTrack(rotation.k, 1, context, (value) => numericValue(value, 1), 0)
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
    const xTrack = isAnimatedProperty(property.x)
      ? createLottieTrack(property.x.k, 1, context, (value) => numericValue(value, 1), 0)
      : null;
    const yTrack = isAnimatedProperty(property.y)
      ? createLottieTrack(property.y.k, 1, context, (value) => numericValue(value, 1), 0)
      : null;
    const carrier = xTrack ?? yTrack;
    if (carrier === null) return null;
    const x = numericValue(initialLottieValue(property.x), 1)[0];
    const y = numericValue(initialLottieValue(property.y), 1)[0];
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
  if (!isAnimatedProperty(property)) return null;
  const track = createLottieTrack(
    property.k,
    2,
    context,
    (value) => numericValue(value, 2),
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

function bindMutableNumericProperty<T>(
  property: Readonly<LottieAnimatable<T>>,
  current: number[],
  convert: (value: number, component: number) => number,
  onChange: () => void,
  context: LottieImportContext,
): void {
  if (!isAnimatedProperty(property)) return;
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
  return numericValue(value, components).map(tangentOf);
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

function appendLottieSolid(parent: DisplayObject, layer: Readonly<LottieLayer>): void {
  const shape = createShape();
  const color = parseHexColor(layer.sc ?? '#000000');
  appendShapeBeginFill(shape, color, 1);
  const path = createPath();
  appendPathRectangle(path, 0, 0, layer.sw ?? 0, layer.sh ?? 0);
  appendShapePath(shape, path.commands.slice(), path.data.slice(), path.winding);
  appendShapeEndFill(shape);
  addNodeChild(parent, shape);
}

function appendLottieImage(parent: DisplayObject, layer: Readonly<LottieLayer>, context: LottieImportContext): void {
  const asset = layer.refId === undefined ? undefined : context.assets.get(layer.refId);
  if (asset === undefined || !isImageAsset(asset)) {
    reportLottieDrop(context, 'lottie.unresolved-asset', 'appendLottieImage', { id: layer.refId ?? '' });
    return;
  }
  const image = context.options?.resolveImageResource?.(asset) ?? null;
  if (image === null) {
    reportLottieSkip(context, 'lottie.unresolved-image', 'appendLottieImage', { id: asset.id });
    return;
  }
  addNodeChild(parent, createSprite({ data: { texture: createTexture({ dimension: '2d', source: image }) } }));
}

function appendLottieText(parent: DisplayObject, layer: Readonly<LottieLayer>, context: LottieImportContext): void {
  const textData = layer.t;
  const first = textData?.d.k[0]?.s;
  if (first === undefined) {
    reportLottieDrop(context, 'lottie.text-missing-document', 'appendLottieText', { layer: layer.nm ?? '' });
    return;
  }
  const label = createTextLabel({
    data: {
      autoSize: 'left',
      height: (first.s ?? 16) * 1.25,
      text: first.t,
      textFormat: createLottieTextFormat(first),
      width: context.document.w,
    },
  });
  addNodeChild(parent, label);
}

function appendLottiePrecomposition(
  parent: DisplayObject,
  layer: Readonly<LottieLayer>,
  context: LottieImportContext,
): void {
  const id = layer.refId;
  const asset = id === undefined ? undefined : context.assets.get(id);
  if (id === undefined || asset === undefined || !isPrecompositionAsset(asset)) {
    reportLottieDrop(context, 'lottie.unresolved-asset', 'appendLottiePrecomposition', { id: id ?? '' });
    return;
  }
  if (context.resolvingPrecompositions.has(id)) {
    reportLottieDrop(context, 'lottie.recursive-precomposition', 'appendLottiePrecomposition', { id });
    return;
  }
  context.resolvingPrecompositions.add(id);
  appendLottieLayers(parent, asset.layers, {
    ...context,
    frameOffset: context.frameOffset + (layer.st ?? 0) * context.frameScale,
    frameScale: context.frameScale * (layer.sr ?? 1),
  });
  context.resolvingPrecompositions.delete(id);
}

function appendLottieShapeItems(
  parent: DisplayObject,
  items: readonly Readonly<LottieShapeItem>[],
  context: LottieImportContext,
  name: string | null = null,
): void {
  const group = createDisplayObject({ name });
  const transform = items.find((item) => item.ty === 'tr');
  if (transform?.ty === 'tr') applyLottieTransform(group, transform as Readonly<LottieTransform>, context);
  const state: LottieShapeState = {
    paints: [],
    paths: [],
    shape: createShape(),
  };
  const rerender = (): void => renderLottieShapeState(state);

  for (const item of items) {
    if (item.hd === true) continue;
    if (item.ty === 'gr') {
      const shapeGroup = item as Readonly<LottieShapeGroup>;
      appendLottieShapeItems(group, shapeGroup.it, context, shapeGroup.nm ?? null);
      continue;
    }
    const path = createLottieShapeItemPath(item);
    if (path !== null) {
      const pathIndex = state.paths.length;
      state.paths.push(path);
      bindLottieGeometryItem(item, state, pathIndex, rerender, context);
    }
    if (item.ty === 'fl') {
      const fill = item as Readonly<LottieFillShapeItem>;
      const color = numericValue(initialLottieValue(fill.c), 3);
      const opacity = [numericValue(initialLottieValue(fill.o), 1)[0] / 100];
      const paint = {
        color,
        kind: 'fill' as const,
        opacity: opacity[0],
        winding: (fill.r === 2 ? 'evenOdd' : 'nonZero') as 'evenOdd' | 'nonZero',
      };
      state.paints.push(paint);
      bindMutableNumericProperty(fill.c, color, (value) => value, rerender, context);
      bindMutableNumericProperty(
        fill.o,
        opacity,
        (value) => value / 100,
        () => {
          paint.opacity = opacity[0];
          rerender();
        },
        context,
      );
    } else if (item.ty === 'st') {
      const stroke = item as Readonly<LottieStrokeShapeItem>;
      const color = numericValue(initialLottieValue(stroke.c), 3);
      const opacity = [numericValue(initialLottieValue(stroke.o), 1)[0] / 100];
      const width = [numericValue(initialLottieValue(stroke.w), 1)[0]];
      const miterLimit = [
        stroke.ml2 === undefined ? (stroke.ml ?? 4) : numericValue(initialLottieValue(stroke.ml2), 1)[0],
      ];
      const dashEntries = stroke.d ?? [];
      const hasAnimatedDash = dashEntries.some((entry) => isAnimatedProperty(entry.v));
      const dash = hasAnimatedDash
        ? []
        : dashEntries
            .filter((entry) => entry.n !== 'o')
            .map((entry) => Math.max(0, numericValue(initialLottieValue(entry.v), 1)[0]));
      const dashOffsetEntry = dashEntries.find((entry) => entry.n === 'o');
      const dashOffset =
        hasAnimatedDash || dashOffsetEntry === undefined
          ? 0
          : numericValue(initialLottieValue(dashOffsetEntry.v), 1)[0];
      if (hasAnimatedDash)
        reportLottieSkip(context, 'lottie.unsupported-shape-modifier', 'appendLottieShapeItems', { modifier: 'dash' });
      const paint = {
        caps: mapLottieLineCap(stroke.lc),
        color,
        dash: dash.some((value) => value > 0) ? dash : [],
        dashOffset,
        joints: mapLottieLineJoin(stroke.lj),
        kind: 'stroke' as const,
        miterLimit: miterLimit[0],
        opacity: opacity[0],
        width: width[0],
      };
      state.paints.push(paint);
      bindMutableNumericProperty(stroke.c, color, (value) => value, rerender, context);
      bindMutableNumericProperty(
        stroke.o,
        opacity,
        (value) => value / 100,
        () => {
          paint.opacity = opacity[0];
          rerender();
        },
        context,
      );
      bindMutableNumericProperty(
        stroke.w,
        width,
        (value) => value,
        () => {
          paint.width = width[0];
          rerender();
        },
        context,
      );
      if (stroke.ml2 !== undefined) {
        bindMutableNumericProperty(
          stroke.ml2,
          miterLimit,
          (value) => value,
          () => {
            paint.miterLimit = miterLimit[0];
            rerender();
          },
          context,
        );
      }
    } else if (item.ty === 'gf' || item.ty === 'gs') {
      const gradient = item as Readonly<LottieGradientShapeItem>;
      const initialGradient = initialLottieValue(gradient.g.k);
      const values = numericValue(
        initialGradient,
        Math.max(gradient.g.p * 4, Array.isArray(initialGradient) ? initialGradient.length : 0),
      );
      const start = numericValue(initialLottieValue(gradient.s), 2);
      const end = numericValue(initialLottieValue(gradient.e), 2);
      const opacity = [gradient.o === undefined ? 100 : numericValue(initialLottieValue(gradient.o), 1)[0]];
      const width = [gradient.w === undefined ? 1 : numericValue(initialLottieValue(gradient.w), 1)[0]];
      const miterLimit = [
        gradient.ml2 === undefined ? (gradient.ml ?? 4) : numericValue(initialLottieValue(gradient.ml2), 1)[0],
      ];
      const dashEntries = gradient.d ?? [];
      const hasAnimatedDash = dashEntries.some((entry) => isAnimatedProperty(entry.v));
      const dash = hasAnimatedDash
        ? []
        : dashEntries
            .filter((entry) => entry.n !== 'o')
            .map((entry) => Math.max(0, numericValue(initialLottieValue(entry.v), 1)[0]));
      const dashOffsetEntry = dashEntries.find((entry) => entry.n === 'o');
      const dashOffset =
        hasAnimatedDash || dashOffsetEntry === undefined
          ? 0
          : numericValue(initialLottieValue(dashOffsetEntry.v), 1)[0];
      if (hasAnimatedDash)
        reportLottieSkip(context, 'lottie.unsupported-shape-modifier', 'appendLottieShapeItems', { modifier: 'dash' });
      const paint = {
        caps: mapLottieLineCap(gradient.lc),
        count: gradient.g.p,
        dash: dash.some((value) => value > 0) ? dash : [],
        dashOffset,
        end,
        joints: mapLottieLineJoin(gradient.lj),
        kind: 'gradient' as const,
        miterLimit: miterLimit[0],
        opacity: opacity[0] / 100,
        shape: gradient.t,
        start,
        type: gradient.ty,
        values,
        width: width[0],
        winding: gradient.r === 2 ? ('evenOdd' as const) : ('nonZero' as const),
      };
      state.paints.push(paint);
      bindMutableNumericProperty(gradient.g.k, values, (value) => value, rerender, context);
      bindMutableNumericProperty(gradient.s, start, (value) => value, rerender, context);
      bindMutableNumericProperty(gradient.e, end, (value) => value, rerender, context);
      if (gradient.o !== undefined) {
        bindMutableNumericProperty(
          gradient.o,
          opacity,
          (value) => value,
          () => {
            paint.opacity = opacity[0] / 100;
            rerender();
          },
          context,
        );
      }
      if (gradient.w !== undefined) {
        bindMutableNumericProperty(
          gradient.w,
          width,
          (value) => value,
          () => {
            paint.width = width[0];
            rerender();
          },
          context,
        );
      }
      if (gradient.ml2 !== undefined) {
        bindMutableNumericProperty(
          gradient.ml2,
          miterLimit,
          (value) => value,
          () => {
            paint.miterLimit = miterLimit[0];
            rerender();
          },
          context,
        );
      }
    } else if (item.ty === 'tm') {
      const trim = item as Readonly<LottieTrimPathShapeItem>;
      if (isAnimatedProperty(trim.s) || isAnimatedProperty(trim.e) || isAnimatedProperty(trim.o)) {
        reportLottieSkip(context, 'lottie.unsupported-shape-modifier', 'appendLottieShapeItems', { modifier: item.ty });
      }
    } else if (item.ty === 'rp' || item.ty === 'mm' || item.ty === 'rd') {
      reportLottieSkip(context, 'lottie.unsupported-shape-modifier', 'appendLottieShapeItems', { modifier: item.ty });
    } else if (item.ty !== 'sh' && item.ty !== 'rc' && item.ty !== 'el' && item.ty !== 'sr' && item.ty !== 'tr') {
      reportLottieSkip(context, 'lottie.unsupported-shape-item', 'appendLottieShapeItems', { shapeType: item.ty });
    }
    reportLottieExpression(item, context);
  }
  applyStaticLottieTrim(items, state);
  renderLottieShapeState(state);
  if (state.paths.length > 0) addNodeChild(group, state.shape);
  addNodeChild(parent, group);
}

function createLottieShapeItemPath(item: Readonly<LottieShapeItem>): Path | null {
  if (item.ty === 'sh') {
    const shapePath = item as Readonly<LottieShapePathItem>;
    const value = toLottieShapePath(initialLottieValue(shapePath.ks));
    if (value === undefined) return null;
    return applyLottieShapeDirection(createLottieBezierPath(value), shapePath.d);
  }
  const path = createPath();
  if (item.ty === 'rc') {
    const rectangle = item as Readonly<LottieRectangleShapeItem>;
    const position = numericValue(initialLottieValue(rectangle.p), 2);
    const size = numericValue(initialLottieValue(rectangle.s), 2);
    const radius = numericValue(initialLottieValue(rectangle.r), 1)[0];
    if (radius > 0) {
      appendPathRoundRectangle(path, position[0] - size[0] / 2, position[1] - size[1] / 2, size[0], size[1], radius);
    } else {
      appendPathRectangle(path, position[0] - size[0] / 2, position[1] - size[1] / 2, size[0], size[1]);
    }
    return applyLottieShapeDirection(path, rectangle.d);
  }
  if (item.ty === 'el') {
    const ellipse = item as Readonly<LottieEllipseShapeItem>;
    const position = numericValue(initialLottieValue(ellipse.p), 2);
    const size = numericValue(initialLottieValue(ellipse.s), 2);
    appendPathEllipse(path, position[0], position[1], size[0] / 2, size[1] / 2);
    return applyLottieShapeDirection(path, ellipse.d);
  }
  if (item.ty === 'sr') {
    const polystar = item as Readonly<LottiePolystarShapeItem>;
    const center = numericValue(initialLottieValue(polystar.p), 2);
    const points = Math.max(2, Math.round(numericValue(initialLottieValue(polystar.pt), 1)[0]));
    const outer = numericValue(initialLottieValue(polystar.or), 1)[0];
    const inner = polystar.sy === 1 ? numericValue(initialLottieValue(polystar.ir), 1)[0] : outer;
    const rotation = numericValue(initialLottieValue(polystar.r), 1)[0];
    const outerRoundness = polystar.os === undefined ? 0 : numericValue(initialLottieValue(polystar.os), 1)[0];
    const innerRoundness =
      polystar.sy === 1 && polystar.is !== undefined ? numericValue(initialLottieValue(polystar.is), 1)[0] : 0;
    return applyLottieShapeDirection(
      createLottiePolystarPath(polystar.sy, center, points, outer, inner, rotation, outerRoundness, innerRoundness),
      polystar.d,
    );
  }
  return null;
}

// Roundness bows each edge outward while the vertices stay on their radius, so the tangent handle is
// perpendicular to the radius. Its length comes from the relation the format itself fixes: a polygon
// at 100% roundness is the circumscribed circle, and the cubic that matches a circular arc spanning
// angle t has handles of r * (4/3) * tan(t / 4). Roundness scales that length linearly.
function createLottiePolystarPath(
  kind: 1 | 2,
  center: readonly number[],
  pointCount: number,
  outer: number,
  inner: number,
  rotationDegrees: number,
  outerRoundness = 0,
  innerRoundness = 0,
): Path {
  const path = createPath();
  const points = Math.max(2, Math.round(pointCount));
  const rotation = degreesToRadians(rotationDegrees - 90);
  const count = kind === 1 ? points * 2 : points;
  const step = (Math.PI * 2) / count;
  const handleScale = (4 / 3) * Math.tan(step / 4);
  const angles: number[] = [];
  const radii: number[] = [];
  const handles: number[] = [];
  const vertices: number[] = [];
  for (let index = 0; index < count; index++) {
    const isInner = kind === 1 && index % 2 === 1;
    const radius = isInner ? inner : outer;
    const roundness = isInner ? innerRoundness : outerRoundness;
    const angle = rotation + index * step;
    angles.push(angle);
    radii.push(radius);
    handles.push((radius * handleScale * roundness) / 100);
    vertices.push(center[0] + Math.cos(angle) * radius, center[1] + Math.sin(angle) * radius);
  }
  if (handles.every((handle) => handle === 0)) {
    appendPathPolygon(path, vertices);
    return path;
  }
  appendPathMoveTo(path, vertices[0], vertices[1]);
  for (let index = 0; index < count; index++) {
    const next = (index + 1) % count;
    // Tangent of increasing angle at each end; the incoming handle points back along the next
    // vertex's tangent, which is why it is subtracted rather than added.
    const outgoingX = vertices[index * 2] - Math.sin(angles[index]) * handles[index];
    const outgoingY = vertices[index * 2 + 1] + Math.cos(angles[index]) * handles[index];
    const incomingX = vertices[next * 2] + Math.sin(angles[next]) * handles[next];
    const incomingY = vertices[next * 2 + 1] - Math.cos(angles[next]) * handles[next];
    appendPathCubicCurveTo(
      path,
      outgoingX,
      outgoingY,
      incomingX,
      incomingY,
      vertices[next * 2],
      vertices[next * 2 + 1],
    );
  }
  return path;
}

function bindLottieGeometryItem(
  item: Readonly<LottieShapeItem>,
  state: LottieShapeState,
  pathIndex: number,
  rerender: () => void,
  context: LottieImportContext,
): void {
  const rebuild = (path: Path): void => {
    state.paths[pathIndex] = applyLottieShapeDirection(path, (item as Readonly<{ d?: 1 | 3 }>).d);
    rerender();
  };
  if (item.ty === 'sh') {
    const shape = item as Readonly<LottieShapePathItem>;
    if (!isAnimatedProperty(shape.ks)) return;
    const template = toLottieShapePath(initialLottieValue(shape.ks));
    if (template === undefined) return;
    const current = flattenLottieShapePath(template);
    const apply = (): void => rebuild(createLottieBezierPath(unflattenLottieShapePath(template, current)));
    appendLottieShapePathChannels(shape.ks.k, current, apply, context);
    return;
  }
  if (item.ty === 'rc') {
    const rectangle = item as Readonly<LottieRectangleShapeItem>;
    const position = numericValue(initialLottieValue(rectangle.p), 2);
    const size = numericValue(initialLottieValue(rectangle.s), 2);
    const radius = [numericValue(initialLottieValue(rectangle.r), 1)[0]];
    const apply = (): void => {
      const path = createPath();
      if (radius[0] > 0) {
        appendPathRoundRectangle(
          path,
          position[0] - size[0] / 2,
          position[1] - size[1] / 2,
          size[0],
          size[1],
          radius[0],
        );
      } else {
        appendPathRectangle(path, position[0] - size[0] / 2, position[1] - size[1] / 2, size[0], size[1]);
      }
      rebuild(path);
    };
    bindMutableNumericProperty(rectangle.p, position, (value) => value, apply, context);
    bindMutableNumericProperty(rectangle.s, size, (value) => value, apply, context);
    bindMutableNumericProperty(rectangle.r, radius, (value) => value, apply, context);
    return;
  }
  if (item.ty === 'el') {
    const ellipse = item as Readonly<LottieEllipseShapeItem>;
    const position = numericValue(initialLottieValue(ellipse.p), 2);
    const size = numericValue(initialLottieValue(ellipse.s), 2);
    const apply = (): void => {
      const path = createPath();
      appendPathEllipse(path, position[0], position[1], size[0] / 2, size[1] / 2);
      rebuild(path);
    };
    bindMutableNumericProperty(ellipse.p, position, (value) => value, apply, context);
    bindMutableNumericProperty(ellipse.s, size, (value) => value, apply, context);
    return;
  }
  if (item.ty === 'sr') {
    const polystar = item as Readonly<LottiePolystarShapeItem>;
    const center = numericValue(initialLottieValue(polystar.p), 2);
    const points = [numericValue(initialLottieValue(polystar.pt), 1)[0]];
    const outer = [numericValue(initialLottieValue(polystar.or), 1)[0]];
    const inner = [polystar.sy === 1 ? numericValue(initialLottieValue(polystar.ir), 1)[0] : outer[0]];
    const rotation = [numericValue(initialLottieValue(polystar.r), 1)[0]];
    const outerRoundness = [polystar.os === undefined ? 0 : numericValue(initialLottieValue(polystar.os), 1)[0]];
    const innerRoundness = [
      polystar.sy === 1 && polystar.is !== undefined ? numericValue(initialLottieValue(polystar.is), 1)[0] : 0,
    ];
    const apply = (): void => {
      rebuild(
        createLottiePolystarPath(
          polystar.sy,
          center,
          points[0],
          outer[0],
          inner[0],
          rotation[0],
          outerRoundness[0],
          innerRoundness[0],
        ),
      );
    };
    bindMutableNumericProperty(polystar.p, center, (value) => value, apply, context);
    bindMutableNumericProperty(polystar.pt, points, (value) => value, apply, context);
    bindMutableNumericProperty(polystar.or, outer, (value) => value, apply, context);
    if (polystar.ir !== undefined) bindMutableNumericProperty(polystar.ir, inner, (value) => value, apply, context);
    bindMutableNumericProperty(polystar.r, rotation, (value) => value, apply, context);
    if (polystar.os !== undefined) {
      bindMutableNumericProperty(polystar.os, outerRoundness, (value) => value, apply, context);
    }
    if (polystar.is !== undefined) {
      bindMutableNumericProperty(polystar.is, innerRoundness, (value) => value, apply, context);
    }
  }
}

function appendLottieShapePathChannels(
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

function flattenLottieShapePath(path: Readonly<LottieShapePath>): number[] {
  const out: number[] = [];
  for (const points of [path.v, path.i, path.o]) {
    for (const point of points) out.push(point[0] ?? 0, point[1] ?? 0);
  }
  return out;
}

function unflattenLottieShapePath(template: Readonly<LottieShapePath>, values: readonly number[]): LottieShapePath {
  const count = template.v.length;
  const readPoints = (offset: number): number[][] => {
    const out: number[][] = [];
    for (let index = 0; index < count; index++) {
      out.push([values[offset + index * 2] ?? 0, values[offset + index * 2 + 1] ?? 0]);
    }
    return out;
  };
  return {
    c: template.c,
    i: readPoints(count * 2),
    o: readPoints(count * 4),
    v: readPoints(0),
  };
}

function applyStaticLottieTrim(items: readonly Readonly<LottieShapeItem>[], state: LottieShapeState): void {
  const raw = items.find((item) => item.ty === 'tm');
  if (raw === undefined) return;
  const trim = raw as Readonly<LottieTrimPathShapeItem>;
  if (isAnimatedProperty(trim.s) || isAnimatedProperty(trim.e) || isAnimatedProperty(trim.o)) return;
  const start = numericValue(initialLottieValue(trim.s), 1)[0] / 100;
  const end = numericValue(initialLottieValue(trim.e), 1)[0] / 100;
  const offset = numericValue(initialLottieValue(trim.o), 1)[0] / 360;
  let visible = (((end - start) % 1) + 1) % 1;
  if (Math.abs(end - start) >= 1) visible = 1;
  state.paths = state.paths.map((path) => {
    if (visible >= 1) return path;
    const length = getPathLength(path);
    const trimmed = createPath(path.winding);
    if (length <= 0 || visible <= 0) return trimmed;
    dashPath(path, [visible * length, (1 - visible) * length], (start + offset) * length, trimmed);
    return trimmed;
  });
}

/**
 * A shape path as the file states it, whichever way it states it.
 *
 * A static path is the object itself; an **animated** one wraps that object in a single-element
 * array inside each keyframe. Across a corpus of eighteen real exports the wrapper is the majority
 * form — 896 keyframed paths against 627 bare — so reading only the bare form crashes on most files.
 */
function toLottieShapePath(value: unknown): Readonly<LottieShapePath> | undefined {
  const path = Array.isArray(value) ? value[0] : value;
  if (path === null || typeof path !== 'object' || !('v' in path)) return undefined;
  return path as Readonly<LottieShapePath>;
}

function createLottieBezierPath(value: Readonly<LottieShapePath>): Path {
  const path = createPath();
  const count = value.v.length;
  if (count === 0) return path;
  appendPathMoveTo(path, value.v[0][0], value.v[0][1]);
  const limit = value.c ? count + 1 : count;
  for (let index = 1; index < limit; index++) {
    const previous = (index - 1) % count;
    const current = index % count;
    const start = value.v[previous];
    const end = value.v[current];
    const outgoing = value.o[previous] ?? [0, 0];
    const incoming = value.i[current] ?? [0, 0];
    if (outgoing[0] === 0 && outgoing[1] === 0 && incoming[0] === 0 && incoming[1] === 0) {
      appendPathLineTo(path, end[0], end[1]);
    } else {
      appendPathCubicCurveTo(
        path,
        start[0] + outgoing[0],
        start[1] + outgoing[1],
        end[0] + incoming[0],
        end[1] + incoming[1],
        end[0],
        end[1],
      );
    }
  }
  return path;
}

// The current representation restates every local path for every local paint. This preserves
// multiple paints when all paths precede all styles, but it does not yet implement Lottie's general
// render stack: styles scope only over preceding shapes (including shapes in nested groups), and
// repeated styles render in reverse order. That needs a scoped stack rather than another field here.
function renderLottieShapeState(state: LottieShapeState): void {
  clearShapeCommands(state.shape);
  if (state.paths.length === 0) return;
  if (state.paints.length === 0) {
    appendLottieShapePaths(state, null);
    return;
  }
  for (const paint of state.paints) {
    if (paint.kind === 'fill') {
      appendShapeBeginFill(state.shape, lottieRgba(paint.color), paint.opacity);
      appendLottieShapePaths(state, paint.winding);
      appendShapeEndFill(state.shape);
    } else if (paint.kind === 'stroke') {
      appendShapeLineStyle(
        state.shape,
        paint.width,
        lottieRgba(paint.color),
        paint.opacity,
        false,
        'normal',
        paint.caps,
        paint.joints,
        paint.miterLimit,
      );
      appendLottieShapePaths(state, null, paint.dash, paint.dashOffset);
    } else if (paint.type === 'gf') {
      appendLottieGradientFill(state.shape, paint);
      appendLottieShapePaths(state, paint.winding);
      appendShapeEndFill(state.shape);
    } else {
      appendLottieGradientStroke(state.shape, paint);
      appendLottieShapePaths(state, null, paint.dash, paint.dashOffset);
    }
  }
}

function appendLottieShapePaths(
  state: LottieShapeState,
  winding: 'evenOdd' | 'nonZero' | null,
  dash: readonly number[] = [],
  dashOffset = 0,
): void {
  for (const path of state.paths) {
    let output = path;
    if (dash.length > 0) {
      output = createPath(path.winding);
      dashPath(path, dash.length % 2 === 0 ? dash : [...dash, ...dash], dashOffset, output);
    }
    appendShapePath(state.shape, output.commands.slice(), output.data.slice(), winding ?? output.winding);
  }
}

function appendLottieGradientFill(shape: Shape, paint: LottieGradientPaint): void {
  const gradient = parseLottieGradient(paint.values, paint.count, paint.opacity);
  appendShapeBeginGradientFill(
    shape,
    paint.shape === 2 ? 'radial' : 'linear',
    gradient.colors,
    gradient.alphas,
    gradient.ratios,
    createLottieGradientMatrix(paint.start, paint.end),
  );
}

function appendLottieGradientStroke(shape: Shape, paint: LottieGradientPaint): void {
  const gradient = parseLottieGradient(paint.values, paint.count, paint.opacity);
  appendShapeLineStyle(shape, paint.width, 0x000000ff, 1, false, 'normal', paint.caps, paint.joints, paint.miterLimit);
  appendShapeLineGradientStyle(
    shape,
    paint.shape === 2 ? 'radial' : 'linear',
    gradient.colors,
    gradient.alphas,
    gradient.ratios,
    createLottieGradientMatrix(paint.start, paint.end),
  );
}

function applyLottieShapeDirection(path: Path, direction: 1 | 3 | undefined): Path {
  if (direction !== 3) return path;
  const reversed = createPath(path.winding);
  reversePath(path, reversed);
  return reversed;
}

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
  if (isAnimatedProperty(first.pt)) {
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
  const times = [0, clamp(start, 0, duration), clamp(end, 0, duration), duration].filter(
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

function reportLottieExpression(value: unknown, context: LottieImportContext): void {
  if (value === null || typeof value !== 'object') return;
  if ('x' in value && typeof value.x === 'string') {
    reportLottieSkip(context, 'lottie.unsupported-expression', 'reportLottieExpression');
  }
  for (const child of Object.values(value)) {
    if (child !== value) reportLottieExpression(child, context);
  }
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
function isAnimatedProperty<T>(
  property: Readonly<LottieAnimatable<T>>,
): property is Readonly<{ a: 1; k: LottieKeyframe<T>[]; x?: string }> {
  if (!Array.isArray(property.k) || property.k.length === 0) return false;
  const first: unknown = property.k[0];
  return typeof first === 'object' && first !== null && 't' in (first as Record<string, unknown>);
}

function initialLottieValue<T>(property: Readonly<LottieAnimatable<T>> | undefined): T | undefined {
  if (property === undefined) return undefined;
  if (!isAnimatedProperty(property)) return property.k;
  return property.k[0]?.s ?? property.k[0]?.e;
}

function isSeparatedPosition(property: Readonly<LottiePositionProperty> | undefined): property is Readonly<{
  s: true;
  x: LottieAnimatable<number>;
  y: LottieAnimatable<number>;
  z?: LottieAnimatable<number>;
}> {
  return property !== undefined && 's' in property && property.s === true && 'x' in property && 'y' in property;
}

function numericValue(value: unknown, components: number): number[] {
  const source = Array.isArray(value) ? value : [value];
  const out = new Array<number>(components);
  for (let index = 0; index < components; index++) {
    const candidate = Number(source[index] ?? source[0] ?? 0);
    out[index] = Number.isFinite(candidate) ? candidate : 0;
  }
  return out;
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

function isImageAsset(asset: Readonly<LottieAsset>): asset is Readonly<LottieImageAsset> {
  return 'p' in asset;
}

function isPrecompositionAsset(asset: Readonly<LottieAsset>): asset is Readonly<LottiePrecompositionAsset> {
  return 'layers' in asset;
}

function createLottieTextFormat(document: Readonly<LottieTextDocument>) {
  const color = document.fc ?? [0, 0, 0];
  return {
    align: document.j === 1 ? ('right' as const) : document.j === 2 ? ('center' as const) : ('left' as const),
    color: packColor(color[0] ?? 0, color[1] ?? 0, color[2] ?? 0, 1),
    font: document.f,
    leading: document.lh,
    letterSpacing: document.tr,
    size: document.s,
  };
}

function parseLottieGradient(values: readonly number[], count: number, opacity: number) {
  const colors: number[] = [];
  const ratios: number[] = [];
  const opacityStops: Array<Readonly<{ alpha: number; offset: number }>> = [];
  for (let index = count * 4; index + 1 < values.length; index += 2) {
    opacityStops.push({
      alpha: clamp(values[index + 1], 0, 1),
      offset: clamp(values[index], 0, 1),
    });
  }
  opacityStops.sort((left, right) => left.offset - right.offset);
  const alphas: number[] = [];
  for (let index = 0; index < count; index++) {
    const offset = index * 4;
    const ratio = clamp(values[offset] ?? 0, 0, 1);
    ratios.push(Math.round(ratio * 255));
    colors.push(lottieRgba(values.slice(offset + 1, offset + 4)));
    alphas.push(opacity * interpolateLottieGradientOpacity(opacityStops, ratio));
  }
  return { alphas, colors, ratios };
}

function interpolateLottieGradientOpacity(
  stops: readonly Readonly<{ alpha: number; offset: number }>[],
  offset: number,
): number {
  if (stops.length === 0) return 1;
  if (offset <= stops[0].offset) return stops[0].alpha;
  for (let index = 1; index < stops.length; index++) {
    const previous = stops[index - 1];
    const next = stops[index];
    if (offset > next.offset) continue;
    const distance = next.offset - previous.offset;
    if (distance === 0) return next.alpha;
    const progress = (offset - previous.offset) / distance;
    return previous.alpha + (next.alpha - previous.alpha) * progress;
  }
  return stops[stops.length - 1].alpha;
}

function createLottieGradientMatrix(start: readonly number[], end: readonly number[]) {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  return createGradientTransformMatrix(
    Math.hypot(dx, dy) * 2,
    Math.hypot(dx, dy) * 2,
    Math.atan2(dy, dx),
    start[0],
    start[1],
  );
}

function lottieRgba(color: readonly number[]): number {
  return (
    ((Math.round(clamp(color[0] ?? 0, 0, 1) * 255) << 24) |
      (Math.round(clamp(color[1] ?? 0, 0, 1) * 255) << 16) |
      (Math.round(clamp(color[2] ?? 0, 0, 1) * 255) << 8) |
      0xff) >>>
    0
  );
}

function mapLottieLineCap(value: 1 | 2 | 3 | undefined): 'none' | 'round' | 'square' {
  return value === 2 ? 'round' : value === 3 ? 'square' : 'none';
}

function mapLottieLineJoin(value: 1 | 2 | 3 | undefined): 'bevel' | 'miter' | 'round' {
  return value === 2 ? 'round' : value === 3 ? 'bevel' : 'miter';
}

function parseHexColor(value: string): number {
  const parsed = Number.parseInt(value.replace(/^#/, ''), 16);
  return Number.isFinite(parsed) ? (((parsed & 0xffffff) << 8) | 0xff) >>> 0 : 0x000000ff;
}

function degreesToRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function reportLottieSkip(
  context: Readonly<LottieImportContext>,
  kind: string,
  origin: string,
  detail?: Record<string, string | number>,
): void {
  reportImportDiagnostic(context.diagnostics, ImportDiagnosticSeverity.Skip, kind, origin, detail);
}

function reportLottieDrop(
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
