import {
  createAnimationChannel,
  createAnimationClip,
  createAnimationClipEvent,
  createAnimationTrack,
  sampleAnimationTrack,
} from '@flighthq/animation';
import { createClipRegionFromPath } from '@flighthq/clip';
import { packColor } from '@flighthq/color';
import { easeCubicBezier } from '@flighthq/easing';
import { createGradientTransformMatrix } from '@flighthq/geometry';
import { reportImportDiagnostic } from '@flighthq/importdiagnostics';
import { addNodeChild } from '@flighthq/node';
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
} from '@flighthq/path';
import { applyAnimationClipToNode2D, createBitmap, createDisplayObject } from '@flighthq/scene2d';
import {
  appendShapeBeginFill,
  appendShapeBeginGradientFill,
  appendShapeEndFill,
  appendShapeLineGradientStyle,
  appendShapeLineStyle,
  appendShapePath,
  clearShapeCommands,
  createShape,
} from '@flighthq/shape';
import { createTextLabel } from '@flighthq/text';
import type {
  AnimationChannel,
  AnimationClip,
  DisplayObject,
  Node2D,
  Node2DAnimationPath,
  Node2DAnimationTarget,
  EasingFunction,
  ImportDiagnostic,
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
  LottiePositionProperty,
  LottiePrecompositionAsset,
  LottiePolystarShapeItem,
  LottieRectangleShapeItem,
  LottieShapeItem,
  LottieShapeGroup,
  LottieShapePathItem,
  LottieShapePath,
  LottieStrokeShapeItem,
  LottieTextDocument,
  LottieTrimPathShapeItem,
  LottieTransform,
  Path,
  Shape,
} from '@flighthq/types';
import { BlendMode, ImportDiagnosticSeverity } from '@flighthq/types';

// Applies both the shared Node2DAnimationTarget channels and the format-owned mutable-content
// targets used by animated shape/paint/mask records.
export function applyAnimationClipToLottieDocument(clip: Readonly<AnimationClip>, time: number): void {
  applyAnimationClipToNode2D(clip, time);
  for (const channel of clip.channels) {
    const target = channel.targetRef as LottieMutableAnimationTarget | null;
    if (target === null || typeof target !== 'object' || target.lottieApply === undefined) continue;
    sampleAnimationTrack(_sampleScratch, channel.track, time);
    target.lottieApply(_sampleScratch);
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
    return { clip: createAnimationClip([]), duration: 0, frameRate: 0, root };
  }

  const context: LottieImportContext = {
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
  return {
    clip: createAnimationClip(context.channels, duration, events),
    duration,
    frameRate: document.fr,
    root,
  };
}

interface LottieImportContext {
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
  lottieApply(sample: Readonly<number[] | Float32Array>): void;
}

interface LottieShapeState {
  fill: { color: number[]; opacity: number; winding: 'evenOdd' | 'nonZero' } | null;
  gradient: {
    count: number;
    end: number[];
    kind: 1 | 2;
    opacity: number;
    start: number[];
    type: 'gf' | 'gs';
    values: number[];
    width: number;
  } | null;
  paths: Path[];
  shape: Shape;
  stroke: { color: number[]; opacity: number; width: number } | null;
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
  applyLottieTransform(container, layer.ks, context);
  applyLottieLayerVisibility(container, layer, context);
  applyLottieBlendMode(container, layer, context);
  reportLottieLayerExclusions(layer, context);

  if (layer.ty === 0) appendLottiePrecomposition(container, layer, context);
  else if (layer.ty === 1) appendLottieSolid(container, layer);
  else if (layer.ty === 2) appendLottieImage(container, layer, context);
  else if (layer.ty === 3) {
    // Null layers intentionally contain only their transform and children.
  } else if (layer.ty === 4) appendLottieShapeItems(container, layer.shapes ?? [], context);
  else if (layer.ty === 5) appendLottieText(container, layer, context);
  else if (layer.ty === 6 || layer.ty === 13) {
    reportLottieSkip(context, layer.ty === 6 ? 'lottie.unsupported-audio-layer' : 'lottie.unsupported-camera-layer', {
      layer: layer.nm ?? '',
    });
  } else {
    reportLottieSkip(context, 'lottie.unsupported-layer', { layerType: layer.ty });
  }

  applyLottieMasks(container, layer.masksProperties ?? [], context);
  return container;
}

function applyLottieTransform(
  target: Node2D,
  transform: Readonly<LottieTransform> | undefined,
  context: LottieImportContext,
): void {
  if (transform === undefined) return;
  if (isSeparatedPosition(transform.p)) {
    applyScalarProperty(target, transform.p.x, 'X', (value) => value, context);
    applyScalarProperty(target, transform.p.y, 'Y', (value) => value, context);
    if (transform.p.z !== undefined) {
      reportLottieSkip(context, 'lottie.unsupported-3d-transform', { property: 'position.z' });
    }
  } else {
    applyVectorProperty(target, transform.p, 'Position', ['X', 'Y'], 2, (value) => value, context);
  }
  applyVectorProperty(target, transform.a, 'Pivot', ['PivotX', 'PivotY'], 2, (value) => value, context);
  applyVectorProperty(target, transform.s, 'Scale', ['ScaleX', 'ScaleY'], 2, (value) => value / 100, context);
  applyScalarProperty(target, transform.r ?? transform.rz, 'Rotation', degreesToRadians, context);
  applyScalarProperty(target, transform.o, 'Alpha', (value) => value / 100, context);
  if (transform.sk !== undefined) {
    applyScalarProperty(target, transform.sk, 'SkewX', degreesToRadians, context);
    if (transform.sa !== undefined) {
      reportLottieSkip(context, 'lottie.unsupported-skew-axis', { property: 'transform.sa' });
    }
  }
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
): void {
  if (!isAnimatedProperty(property)) return;
  const keyframes = property.k;
  if (keyframes.length === 0) return;
  const componentSpecific = hasComponentSpecificEasing(keyframes, components);
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
      createLottieTrack(keyframes, components, context, (value) => numericValue(value, components).map(convert), 0),
      target(null),
    ),
  );
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
) {
  const times: number[] = [];
  const values: number[] = [];
  const retained: Array<Readonly<LottieKeyframe<T>>> = [];
  for (let index = 0; index < keyframes.length; index++) {
    const keyframe = keyframes[index];
    const time = frameToSeconds(keyframe.t, context);
    if (times.length > 0 && time <= times[times.length - 1]) continue;
    times.push(time);
    retained.push(keyframe);
    const source = keyframe.s ?? keyframes[index - 1]?.e;
    values.push(...valueOf(source, index));
  }
  const segmentEasings: Array<EasingFunction | null> = [];
  for (let index = 0; index < retained.length - 1; index++) {
    const keyframe = retained[index];
    if (keyframe.h === 1) {
      segmentEasings.push(_holdEasing);
    } else {
      segmentEasings.push(createLottieSegmentEasing(keyframe.o, retained[index + 1].i, easingComponent));
    }
  }
  return createAnimationTrack({
    components,
    interpolation: 'Linear',
    segmentEasings,
    times,
    values,
  });
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
    reportLottieDrop(context, 'lottie.unresolved-asset', { id: layer.refId ?? '' });
    return;
  }
  const image = context.options?.resolveImageResource?.(asset) ?? null;
  if (image === null) {
    reportLottieSkip(context, 'lottie.unresolved-image', { id: asset.id });
    return;
  }
  addNodeChild(parent, createBitmap({ data: { image, smoothing: true } }));
}

function appendLottieText(parent: DisplayObject, layer: Readonly<LottieLayer>, context: LottieImportContext): void {
  const textData = layer.t;
  const first = textData?.d.k[0]?.s;
  if (first === undefined) {
    reportLottieDrop(context, 'lottie.text-missing-document', { layer: layer.nm ?? '' });
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
  if ((textData?.a?.length ?? 0) > 0) {
    reportLottieSkip(context, 'lottie.unsupported-text-animator', { layer: layer.nm ?? '' });
  }
  if ((textData?.d.k.length ?? 0) > 1) {
    reportLottieSkip(context, 'lottie.unsupported-animated-text-document', { layer: layer.nm ?? '' });
  }
}

function appendLottiePrecomposition(
  parent: DisplayObject,
  layer: Readonly<LottieLayer>,
  context: LottieImportContext,
): void {
  const id = layer.refId;
  const asset = id === undefined ? undefined : context.assets.get(id);
  if (id === undefined || asset === undefined || !isPrecompositionAsset(asset)) {
    reportLottieDrop(context, 'lottie.unresolved-asset', { id: id ?? '' });
    return;
  }
  if (context.resolvingPrecompositions.has(id)) {
    reportLottieDrop(context, 'lottie.recursive-precomposition', { id });
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
): void {
  const group = createDisplayObject();
  const transform = items.find((item) => item.ty === 'tr');
  if (transform?.ty === 'tr') applyLottieTransform(group, transform as Readonly<LottieTransform>, context);
  const state: LottieShapeState = {
    fill: null,
    gradient: null,
    paths: [],
    shape: createShape(),
    stroke: null,
  };
  const rerender = (): void => renderLottieShapeState(state);

  for (const item of items) {
    if (item.hd === true) continue;
    if (item.ty === 'gr') {
      appendLottieShapeItems(group, (item as Readonly<LottieShapeGroup>).it, context);
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
      state.fill = {
        color,
        opacity: opacity[0],
        winding: fill.r === 2 ? 'evenOdd' : 'nonZero',
      };
      bindMutableNumericProperty(fill.c, color, (value) => value, rerender, context);
      bindMutableNumericProperty(
        fill.o,
        opacity,
        (value) => value / 100,
        () => {
          state.fill!.opacity = opacity[0];
          rerender();
        },
        context,
      );
    } else if (item.ty === 'st') {
      const stroke = item as Readonly<LottieStrokeShapeItem>;
      const color = numericValue(initialLottieValue(stroke.c), 3);
      const opacity = [numericValue(initialLottieValue(stroke.o), 1)[0] / 100];
      const width = [numericValue(initialLottieValue(stroke.w), 1)[0]];
      state.stroke = {
        color,
        opacity: opacity[0],
        width: width[0],
      };
      bindMutableNumericProperty(stroke.c, color, (value) => value, rerender, context);
      bindMutableNumericProperty(
        stroke.o,
        opacity,
        (value) => value / 100,
        () => {
          state.stroke!.opacity = opacity[0];
          rerender();
        },
        context,
      );
      bindMutableNumericProperty(
        stroke.w,
        width,
        (value) => value,
        () => {
          state.stroke!.width = width[0];
          rerender();
        },
        context,
      );
      if (stroke.d !== undefined) {
        reportLottieSkip(context, 'lottie.unsupported-animated-dash', { shape: item.nm ?? '' });
      }
    } else if (item.ty === 'gf' || item.ty === 'gs') {
      const gradient = item as Readonly<LottieGradientShapeItem>;
      const values = numericValue(initialLottieValue(gradient.g.k), gradient.g.p * 4);
      const start = numericValue(initialLottieValue(gradient.s), 2);
      const end = numericValue(initialLottieValue(gradient.e), 2);
      const opacity = [gradient.o === undefined ? 100 : numericValue(initialLottieValue(gradient.o), 1)[0]];
      const width = [gradient.w === undefined ? 1 : numericValue(initialLottieValue(gradient.w), 1)[0]];
      state.gradient = {
        count: gradient.g.p,
        end,
        kind: gradient.t,
        opacity: opacity[0] / 100,
        start,
        type: gradient.ty,
        values,
        width: width[0],
      };
      bindMutableNumericProperty(gradient.g.k, values, (value) => value, rerender, context);
      bindMutableNumericProperty(gradient.s, start, (value) => value, rerender, context);
      bindMutableNumericProperty(gradient.e, end, (value) => value, rerender, context);
      if (gradient.o !== undefined) {
        bindMutableNumericProperty(
          gradient.o,
          opacity,
          (value) => value,
          () => {
            state.gradient!.opacity = opacity[0] / 100;
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
            state.gradient!.width = width[0];
            rerender();
          },
          context,
        );
      }
    } else if (item.ty === 'tm') {
      const trim = item as Readonly<LottieTrimPathShapeItem>;
      if (isAnimatedProperty(trim.s) || isAnimatedProperty(trim.e) || isAnimatedProperty(trim.o)) {
        reportLottieSkip(context, 'lottie.unsupported-shape-modifier', { modifier: item.ty });
      }
    } else if (item.ty === 'rp' || item.ty === 'mm' || item.ty === 'rd') {
      reportLottieSkip(context, 'lottie.unsupported-shape-modifier', { modifier: item.ty });
    } else if (item.ty !== 'sh' && item.ty !== 'rc' && item.ty !== 'el' && item.ty !== 'sr' && item.ty !== 'tr') {
      reportLottieSkip(context, 'lottie.unsupported-shape-item', { shapeType: item.ty });
    }
    reportLottieExpression(item, context);
  }
  applyStaticLottieTrim(items, state, context);
  renderLottieShapeState(state);
  if (state.paths.length > 0) addNodeChild(group, state.shape);
  addNodeChild(parent, group);
}

function createLottieShapeItemPath(item: Readonly<LottieShapeItem>): Path | null {
  if (item.ty === 'sh') {
    const shapePath = item as Readonly<LottieShapePathItem>;
    const value = initialLottieValue(shapePath.ks);
    if (value === undefined) return null;
    return createLottieBezierPath(value);
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
    return path;
  }
  if (item.ty === 'el') {
    const ellipse = item as Readonly<LottieEllipseShapeItem>;
    const position = numericValue(initialLottieValue(ellipse.p), 2);
    const size = numericValue(initialLottieValue(ellipse.s), 2);
    appendPathEllipse(path, position[0], position[1], size[0] / 2, size[1] / 2);
    return path;
  }
  if (item.ty === 'sr') {
    const polystar = item as Readonly<LottiePolystarShapeItem>;
    const center = numericValue(initialLottieValue(polystar.p), 2);
    const points = Math.max(2, Math.round(numericValue(initialLottieValue(polystar.pt), 1)[0]));
    const outer = numericValue(initialLottieValue(polystar.or), 1)[0];
    const inner = polystar.sy === 1 ? numericValue(initialLottieValue(polystar.ir), 1)[0] : outer;
    const rotation = numericValue(initialLottieValue(polystar.r), 1)[0];
    return createLottiePolystarPath(polystar.sy, center, points, outer, inner, rotation);
  }
  return null;
}

function createLottiePolystarPath(
  kind: 1 | 2,
  center: readonly number[],
  pointCount: number,
  outer: number,
  inner: number,
  rotationDegrees: number,
): Path {
  const path = createPath();
  const points = Math.max(2, Math.round(pointCount));
  const rotation = degreesToRadians(rotationDegrees - 90);
  const vertices: number[] = [];
  const count = kind === 1 ? points * 2 : points;
  for (let index = 0; index < count; index++) {
    const radius = kind === 1 && index % 2 === 1 ? inner : outer;
    const angle = rotation + (index * Math.PI * 2) / count;
    vertices.push(center[0] + Math.cos(angle) * radius, center[1] + Math.sin(angle) * radius);
  }
  appendPathPolygon(path, vertices);
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
    state.paths[pathIndex] = path;
    rerender();
  };
  if (item.ty === 'sh') {
    const shape = item as Readonly<LottieShapePathItem>;
    if (!isAnimatedProperty(shape.ks)) return;
    const template = initialLottieValue(shape.ks);
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
    const apply = (): void => {
      rebuild(createLottiePolystarPath(polystar.sy, center, points[0], outer[0], inner[0], rotation[0]));
    };
    bindMutableNumericProperty(polystar.p, center, (value) => value, apply, context);
    bindMutableNumericProperty(polystar.pt, points, (value) => value, apply, context);
    bindMutableNumericProperty(polystar.or, outer, (value) => value, apply, context);
    if (polystar.ir !== undefined) bindMutableNumericProperty(polystar.ir, inner, (value) => value, apply, context);
    bindMutableNumericProperty(polystar.r, rotation, (value) => value, apply, context);
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
      const value = keyframe.s ?? keyframe.e;
      return value !== undefined && flattenLottieShapePath(value).length !== current.length;
    })
  ) {
    reportLottieDrop(context, 'lottie.incompatible-animated-shape-path');
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
            (value) => [flattenLottieShapePath(value ?? keyframes[0].s!)[component] ?? current[component]],
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
        (value) => flattenLottieShapePath(value ?? keyframes[0].s!),
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

function applyStaticLottieTrim(
  items: readonly Readonly<LottieShapeItem>[],
  state: LottieShapeState,
  context: LottieImportContext,
): void {
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
  if (trim.m === 2 && state.paths.length > 1) {
    reportLottieSkip(context, 'lottie.trim-individual-approximated', { count: state.paths.length });
  }
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

function renderLottieShapeState(state: LottieShapeState): void {
  clearShapeCommands(state.shape);
  if (state.fill !== null) {
    appendShapeBeginFill(state.shape, lottieRgb(state.fill.color), state.fill.opacity);
  } else if (state.gradient !== null && state.gradient.type === 'gf') {
    appendLottieGradientFill(state.shape, state.gradient);
  }
  if (state.stroke !== null) {
    appendShapeLineStyle(state.shape, state.stroke.width, lottieRgb(state.stroke.color), state.stroke.opacity);
  } else if (state.gradient !== null && state.gradient.type === 'gs') {
    appendLottieGradientStroke(state.shape, state.gradient);
  }
  for (const path of state.paths) {
    appendShapePath(state.shape, path.commands.slice(), path.data.slice(), state.fill?.winding ?? path.winding);
  }
  if (state.fill !== null || state.gradient?.type === 'gf') appendShapeEndFill(state.shape);
}

function appendLottieGradientFill(shape: Shape, state: NonNullable<LottieShapeState['gradient']>): void {
  const gradient = parseLottieGradient(state.values, state.count, state.opacity);
  appendShapeBeginGradientFill(
    shape,
    state.kind === 2 ? 'radial' : 'linear',
    gradient.colors,
    gradient.alphas,
    gradient.ratios,
    createLottieGradientMatrix(state.start, state.end),
  );
}

function appendLottieGradientStroke(shape: Shape, state: NonNullable<LottieShapeState['gradient']>): void {
  const gradient = parseLottieGradient(state.values, state.count, state.opacity);
  appendShapeLineStyle(shape, state.width);
  appendShapeLineGradientStyle(
    shape,
    state.kind === 2 ? 'radial' : 'linear',
    gradient.colors,
    gradient.alphas,
    gradient.ratios,
    createLottieGradientMatrix(state.start, state.end),
  );
}

function applyLottieMasks(target: Node2D, masks: readonly Readonly<LottieMask>[], context: LottieImportContext): void {
  const active = masks.filter((mask) => mask.mode !== 'n');
  if (active.length === 0) return;
  const first = active[0];
  if (first.mode !== 'a' || first.inv === true || active.length > 1) {
    reportLottieSkip(context, 'lottie.unsupported-mask-composition', {
      count: active.length,
      mode: first.mode,
    });
    return;
  }
  const initial = initialLottieValue(first.pt);
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
  if (first.f !== undefined || first.x !== undefined) {
    reportLottieSkip(context, 'lottie.unsupported-soft-mask', { mask: first.nm ?? '' });
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

function applyLottieBlendMode(target: Node2D, layer: Readonly<LottieLayer>, context: LottieImportContext): void {
  const mode = layer.bm ?? 0;
  if (mode === 0) target.blendMode = BlendMode.Normal;
  else if (mode === 1) target.blendMode = BlendMode.Multiply;
  else if (mode === 2) target.blendMode = BlendMode.Screen;
  else if (mode === 3) target.blendMode = BlendMode.Add;
  else if (mode === 8) target.blendMode = BlendMode.Darken;
  else if (mode === 9) target.blendMode = BlendMode.Lighten;
  else reportLottieSkip(context, 'lottie.unsupported-blend-mode', { blendMode: mode });
}

function reportLottieLayerExclusions(layer: Readonly<LottieLayer>, context: LottieImportContext): void {
  if (layer.ddd === 1) reportLottieSkip(context, 'lottie.unsupported-3d-layer', { layer: layer.nm ?? '' });
  if ((layer.ef?.length ?? 0) > 0) reportLottieSkip(context, 'lottie.unsupported-effect', { layer: layer.nm ?? '' });
  if (layer.tm !== undefined) reportLottieSkip(context, 'lottie.unsupported-time-remap', { layer: layer.nm ?? '' });
  if (layer.tt !== undefined || layer.td !== undefined) {
    reportLottieSkip(context, 'lottie.unsupported-matte', { layer: layer.nm ?? '' });
  }
  reportLottieExpression(layer.ks, context);
}

function reportLottieExpression(value: unknown, context: LottieImportContext): void {
  if (value === null || typeof value !== 'object') return;
  if ('x' in value && typeof value.x === 'string') {
    reportLottieSkip(context, 'lottie.unsupported-expression');
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

function isAnimatedProperty<T>(
  property: Readonly<LottieAnimatable<T>>,
): property is Readonly<{ a: 1; k: LottieKeyframe<T>[]; x?: string }> {
  return property.a === 1 && Array.isArray(property.k);
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
    const next = keyframes[index + 1];
    for (const handle of [current.o, next.i]) {
      if (handle === undefined) continue;
      if (handleVaries(handle.x, components) || handleVaries(handle.y, components)) return true;
    }
  }
  return false;
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
  for (let index = 0; index < count; index++) {
    const offset = index * 4;
    ratios.push(Math.round(clamp(values[offset] ?? 0, 0, 1) * 255));
    colors.push(lottieRgb(values.slice(offset + 1, offset + 4)));
  }
  return { alphas: new Array<number>(count).fill(opacity), colors, ratios };
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

function lottieRgb(color: readonly number[]): number {
  return (
    (Math.round(clamp(color[0] ?? 0, 0, 1) * 255) << 16) |
    (Math.round(clamp(color[1] ?? 0, 0, 1) * 255) << 8) |
    Math.round(clamp(color[2] ?? 0, 0, 1) * 255)
  );
}

function parseHexColor(value: string): number {
  const parsed = Number.parseInt(value.replace(/^#/, ''), 16);
  return Number.isFinite(parsed) ? parsed & 0xffffff : 0;
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
  detail?: Record<string, string | number>,
): void {
  reportImportDiagnostic(context.diagnostics, ImportDiagnosticSeverity.Skip, kind, 'lottieDocument', detail);
}

function reportLottieDrop(
  context: Readonly<LottieImportContext>,
  kind: string,
  detail?: Record<string, string | number>,
): void {
  reportImportDiagnostic(context.diagnostics, ImportDiagnosticSeverity.Drop, kind, 'lottieDocument', detail);
}

const _sampleScratch = new Array<number>(256).fill(0);
const _holdEasing: EasingFunction = () => 0;
