/**
 * Bodymovin/Lottie JSON schema types used by `@flighthq/scene2d-formats`. The schema is
 * intentionally data-only: numeric codes and abbreviated field names match the interchange format
 * so parsing does not allocate a duplicate normalized document before it creates Flight nodes.
 */

export interface LottieBezierHandle {
  x: number | number[];
  y: number | number[];
}

export interface LottieKeyframe<T> {
  /** End value. Some exporters omit it because the next keyframe's start value is authoritative. */
  e?: T;
  /** Hold keyframe: 1 means step interpolation. */
  h?: 0 | 1;
  /** Temporal Bezier handle entering the next keyframe. */
  i?: LottieBezierHandle;
  /** Incoming spatial tangent for multidimensional motion paths. */
  ti?: number[];
  /** Outgoing temporal Bezier handle. */
  o?: LottieBezierHandle;
  /** Start value. */
  s?: T;
  /** Frame number in the containing composition. */
  t: number;
  /** Outgoing spatial tangent for multidimensional motion paths. */
  to?: number[];
}

export interface LottieStaticProperty<T> {
  a?: 0;
  k: T;
  /** After Effects expression source. Importers diagnose and skip this executable string. */
  x?: string;
}

export interface LottieAnimatedProperty<T> {
  a: 1;
  k: LottieKeyframe<T>[];
  /** After Effects expression source. Importers diagnose and skip this executable string. */
  x?: string;
}

export type LottieAnimatable<T> = LottieAnimatedProperty<T> | LottieStaticProperty<T>;

export interface LottieSeparatedPositionProperty {
  s: true;
  x: LottieAnimatable<number>;
  y: LottieAnimatable<number>;
  z?: LottieAnimatable<number>;
}

export type LottiePositionProperty = LottieAnimatable<number[]> | LottieSeparatedPositionProperty;

export interface LottieTransform {
  /** Anchor point. */
  a?: LottieAnimatable<number[]>;
  /** Opacity, in percent. */
  o?: LottieAnimatable<number>;
  /** Position, either combined or separated dimensions. */
  p?: LottiePositionProperty;
  /** 2D rotation. */
  r?: LottieAnimatable<number>;
  /** 3D Z rotation; exporters use this instead of `r` on 3D layers. */
  rz?: LottieAnimatable<number>;
  /** Scale, in percent. */
  s?: LottieAnimatable<number[]>;
  /** Skew axis. */
  sa?: LottieAnimatable<number>;
  /** Skew angle. */
  sk?: LottieAnimatable<number>;
}

export interface LottieShapePath {
  /** Closed contour. */
  c: boolean;
  /** Incoming tangents, relative to each vertex. */
  i: number[][];
  /** Outgoing tangents, relative to each vertex. */
  o: number[][];
  /** Vertices. */
  v: number[][];
}

export interface LottieShapeItemBase {
  /** Hidden item. */
  hd?: boolean;
  /** Property index used by expressions. */
  ix?: number;
  nm?: string;
  /** Bodymovin shape kind. */
  ty: string;
}

export interface LottieShapeGroup extends LottieShapeItemBase {
  it: LottieShapeItem[];
  np?: number;
  ty: 'gr';
}

export interface LottieShapePathItem extends LottieShapeItemBase {
  /** Drawing direction: 1 = normal, 3 = reversed. */
  d?: 1 | 3;
  ind?: number;
  ks: LottieAnimatable<LottieShapePath>;
  ty: 'sh';
}

export interface LottieRectangleShapeItem extends LottieShapeItemBase {
  /** Drawing direction: 1 = normal, 3 = reversed. */
  d?: 1 | 3;
  /** Position. */
  p: LottieAnimatable<number[]>;
  /** Corner radius. */
  r: LottieAnimatable<number>;
  /** Size. */
  s: LottieAnimatable<number[]>;
  ty: 'rc';
}

export interface LottieEllipseShapeItem extends LottieShapeItemBase {
  /** Drawing direction: 1 = normal, 3 = reversed. */
  d?: 1 | 3;
  p: LottieAnimatable<number[]>;
  s: LottieAnimatable<number[]>;
  ty: 'el';
}

export interface LottiePolystarShapeItem extends LottieShapeItemBase {
  /** Drawing direction: 1 = normal, 3 = reversed. */
  d?: 1 | 3;
  /** Inner radius and roundness for stars. */
  ir?: LottieAnimatable<number>;
  is?: LottieAnimatable<number>;
  /** Outer radius and roundness. */
  or: LottieAnimatable<number>;
  os: LottieAnimatable<number>;
  p: LottieAnimatable<number[]>;
  /** Point count. */
  pt: LottieAnimatable<number>;
  r: LottieAnimatable<number>;
  /** 1 = star, 2 = polygon. */
  sy: 1 | 2;
  ty: 'sr';
}

export interface LottieFillShapeItem extends LottieShapeItemBase {
  /** Shape-style blend mode. */
  bm?: number;
  /** RGB components in normalized authoring space. */
  c: LottieAnimatable<number[]>;
  /** Fill rule: 1 = non-zero, 2 = even-odd. */
  r?: 1 | 2;
  /** Opacity, in percent. */
  o: LottieAnimatable<number>;
  ty: 'fl';
}

export interface LottieDashEntry {
  /** d = dash, g = gap, o = offset. */
  n: 'd' | 'g' | 'o';
  nm?: string;
  v: LottieAnimatable<number>;
}

export interface LottieStrokeShapeItem extends LottieShapeItemBase {
  /** Shape-style blend mode. */
  bm?: number;
  c: LottieAnimatable<number[]>;
  d?: LottieDashEntry[];
  /** Line cap: 1 = butt, 2 = round, 3 = square. */
  lc?: 1 | 2 | 3;
  /** Line join: 1 = miter, 2 = round, 3 = bevel. */
  lj?: 1 | 2 | 3;
  ml?: number;
  /** Animatable alternative to `ml`. */
  ml2?: LottieAnimatable<number>;
  o: LottieAnimatable<number>;
  ty: 'st';
  w: LottieAnimatable<number>;
}

export interface LottieGradient {
  /** Color stop count. */
  p: number;
  /** Packed stop offsets/colors followed by optional opacity stops. */
  k: LottieAnimatable<number[]>;
}

export interface LottieGradientShapeItem extends LottieShapeItemBase {
  /** Shape-style blend mode. */
  bm?: number;
  d?: LottieDashEntry[];
  /** End point. */
  e: LottieAnimatable<number[]>;
  g: LottieGradient;
  /** Radial highlight angle and length. */
  a?: LottieAnimatable<number>;
  h?: LottieAnimatable<number>;
  /** Line cap: 1 = butt, 2 = round, 3 = square. Gradient strokes only. */
  lc?: 1 | 2 | 3;
  /** Line join: 1 = miter, 2 = round, 3 = bevel. Gradient strokes only. */
  lj?: 1 | 2 | 3;
  /** Miter limit. Gradient strokes only. */
  ml?: number;
  /** Animatable alternative to `ml`. Gradient strokes only. */
  ml2?: LottieAnimatable<number>;
  o?: LottieAnimatable<number>;
  /** Fill rule for gradient fills: 1 = non-zero, 2 = even-odd. */
  r?: 1 | 2;
  /** Gradient kind: 1 = linear, 2 = radial. */
  t: 1 | 2;
  /** Start point. */
  s: LottieAnimatable<number[]>;
  ty: 'gf' | 'gs';
  w?: LottieAnimatable<number>;
}

export interface LottieTransformShapeItem extends LottieShapeItemBase, LottieTransform {
  ty: 'tr';
}

export interface LottieRepeaterTransform extends LottieTransform {
  /** End/start opacity, in percent. */
  eo?: LottieAnimatable<number>;
  so?: LottieAnimatable<number>;
}

export interface LottieTrimPathShapeItem extends LottieShapeItemBase {
  e: LottieAnimatable<number>;
  /** 1 = simultaneously, 2 = individually. */
  m: 1 | 2;
  o: LottieAnimatable<number>;
  s: LottieAnimatable<number>;
  ty: 'tm';
}

export interface LottieRepeaterShapeItem extends LottieShapeItemBase {
  c: LottieAnimatable<number>;
  m?: 1 | 2;
  o: LottieAnimatable<number>;
  tr: LottieRepeaterTransform;
  ty: 'rp';
}

export interface LottieMergePathShapeItem extends LottieShapeItemBase {
  /** Merge mode: merge/add/subtract/intersect/exclude. */
  mm: 1 | 2 | 3 | 4 | 5;
  ty: 'mm';
}

export interface LottieRoundedCornersShapeItem extends LottieShapeItemBase {
  r: LottieAnimatable<number>;
  ty: 'rd';
}

export interface LottieUnknownShapeItem extends LottieShapeItemBase {
  [field: string]: unknown;
}

export type LottieShapeItem =
  | LottieEllipseShapeItem
  | LottieFillShapeItem
  | LottieGradientShapeItem
  | LottieMergePathShapeItem
  | LottiePolystarShapeItem
  | LottieRectangleShapeItem
  | LottieRepeaterShapeItem
  | LottieRoundedCornersShapeItem
  | LottieShapeGroup
  | LottieShapePathItem
  | LottieStrokeShapeItem
  | LottieTransformShapeItem
  | LottieTrimPathShapeItem
  | LottieUnknownShapeItem;

export interface LottieMask {
  /** Inverted mask. */
  inv?: boolean;
  mode: 'a' | 'd' | 'f' | 'i' | 'l' | 'n' | 's';
  nm?: string;
  o: LottieAnimatable<number>;
  pt: LottieAnimatable<LottieShapePath>;
  /** Feather and expansion. */
  f?: LottieAnimatable<number[]>;
  x?: LottieAnimatable<number>;
}

export interface LottieTextDocument {
  /** Fill color. */
  fc?: number[];
  /** Font family/style identifier. */
  f?: string;
  /** Font size. */
  s?: number;
  /** Stroke color and width. */
  sc?: number[];
  sw?: number;
  /** Text string. */
  t: string;
  /** Tracking and line height. */
  tr?: number;
  lh?: number;
  /** Justification: 0 left, 1 right, 2 center. */
  j?: 0 | 1 | 2;
}

export interface LottieTextData {
  d: {
    k: LottieKeyframe<LottieTextDocument>[];
  };
  /** Text animator data is retained structurally and diagnosed until modeled. */
  a?: unknown[];
  m?: unknown;
  p?: unknown;
}

export interface LottieEffect {
  ef?: LottieEffect[];
  ix?: number;
  mn?: string;
  nm?: string;
  ty?: number;
  v?: LottieAnimatable<number | number[]>;
}

export interface LottieLayer {
  /** Auto-orient the layer to its animated position path. */
  ao?: 0 | 1;
  /** Blend-mode code. */
  bm?: number;
  /** 3D layer flag. */
  ddd?: 0 | 1;
  ef?: LottieEffect[];
  /** Hidden layers retain their transform for parenting but do not render their own content. */
  hd?: boolean;
  /** Stable layer index and optional parent index. */
  ind?: number;
  parent?: number;
  /** In/out points, start time, and stretch in document frames. */
  ip?: number;
  op?: number;
  st?: number;
  sr?: number;
  ks?: LottieTransform;
  masksProperties?: LottieMask[];
  nm?: string;
  /** Asset reference for image/precomposition layers. */
  refId?: string;
  shapes?: LottieShapeItem[];
  /** Solid-layer color and dimensions. */
  sc?: string;
  sh?: number;
  sw?: number;
  t?: LottieTextData;
  /** Track-matte mode and matte-source marker. */
  tt?: number;
  td?: number;
  /** Explicit matte-layer index used by newer exporters. */
  tp?: number;
  /** Layer type: precomp, solid, image, null, shape, text, audio, camera, and exporter extensions. */
  ty: number;
  /** Time-remapping property. */
  tm?: LottieAnimatable<number>;
}

export interface LottieImageAsset {
  /** 1 means `p` is an embedded data URI. */
  e?: 0 | 1;
  h?: number;
  id: string;
  /** File/base names. */
  p: string;
  u?: string;
  w?: number;
}

export interface LottiePrecompositionAsset {
  h?: number;
  id: string;
  layers: LottieLayer[];
  nm?: string;
  w?: number;
}

export type LottieAsset = LottieImageAsset | LottiePrecompositionAsset;

export interface LottieFont {
  fFamily?: string;
  fName: string;
  fStyle?: string;
  ascent?: number;
}

export interface LottieMarker {
  /** Comment/name, duration, and frame time. */
  cm: string;
  dr: number;
  tm: number;
}

export interface LottieDocument {
  assets?: LottieAsset[];
  chars?: unknown[];
  ddd?: 0 | 1;
  fonts?: {
    list: LottieFont[];
  };
  /** Frame rate and in/out points. */
  fr: number;
  ip: number;
  op: number;
  h: number;
  layers: LottieLayer[];
  markers?: LottieMarker[];
  nm?: string;
  /** Bodymovin schema version. */
  v?: string;
  w: number;
}
