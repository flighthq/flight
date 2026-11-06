// Exact dependency bridge for the two registries whose owners depend on Render. Keeping only their
// structural callback contracts here breaks the genuine effects/canvas -> render cycle without
// restoring the full Types barrel to Render's contract project.
import type { Bitmap } from '@flighthq/bitmap/contract';
import type { EntityRaw, EntityRuntime, EntityRuntimeKey, Kind } from '@flighthq/entity/contract';
import type { Matrix } from '@flighthq/geometry/contract';
import type { LineScaleMode, ShapeBoundsCommand, ShapeCommandKey } from '@flighthq/shape/contract';
import type { CanvasSurface, HostCanvasCapability } from '@flighthq/surface/contract';
import type { Texture, TextureSourceKind } from '@flighthq/texture/contract';

interface Effect extends EntityRaw {
  [EntityRuntimeKey]: EntityRuntime | undefined;
  kind: Kind;
}

export interface EffectPadding {
  bottom: number;
  left: number;
  right: number;
  top: number;
}

export type EffectPaddingResolver = (effect: Readonly<Effect>) => Readonly<EffectPadding>;

type RenderRegistryTableBridge = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

type CanvasTextureResolver = (
  resolvers: CanvasTextureResolvers,
  texture: Readonly<Texture>,
) => CanvasImageSource | null;

interface CanvasTextureResolvers extends EntityRaw {
  [EntityRuntimeKey]: EntityRuntime | undefined;
  readonly canvasHost: Readonly<HostCanvasCapability>;
  registry?: Map<TextureSourceKind, CanvasTextureResolver> | null;
  bitmapElementCache?: WeakMap<Bitmap, { element: HTMLCanvasElement; version: number }>;
  textureWindowElementCache?: WeakMap<
    Texture,
    {
      element: HTMLCanvasElement;
      surface: CanvasSurface;
      flipX: boolean;
      flipY: boolean;
      imageVersion: number;
      source: CanvasImageSource;
      textureVersion: number;
      uvOffsetX: number;
      uvOffsetY: number;
      uvRotation: number;
      uvScaleX: number;
      uvScaleY: number;
    }
  >;
  registryMiss?: ((registry: RenderRegistryTableBridge, kind: Kind) => void) | null;
}

export interface CanvasShapeDrawState {
  canvasTextureResolvers: CanvasTextureResolvers;
  allowSmoothing: boolean;
  hasFill: boolean;
  fillStyle: string | CanvasPattern | CanvasGradient;
  fillMatrix: Matrix | null;
  fillMatrixInverse: Matrix | null;
  hasStroke: boolean;
  lineScaleMode: LineScaleMode;
  strokeStyle: string | CanvasPattern | CanvasGradient;
  strokeWidth: number;
  currentX: number;
  currentY: number;
  hasPendingPath: boolean;
  hasCurrentPoint: boolean;
  subpathStartX: number;
  subpathStartY: number;
  windingRule: CanvasFillRule;
  bitmapSrc: CanvasImageSource | null;
  bitmapW: number;
  bitmapH: number;
  flush: () => void;
}

export type CanvasShapeHandler = (
  ctx: CanvasRenderingContext2D,
  state: CanvasShapeDrawState,
  buf: unknown[],
  i: number,
) => void;

export interface CanvasShapeCommand<K extends ShapeCommandKey = ShapeCommandKey> extends ShapeBoundsCommand<K> {
  readonly draw: CanvasShapeHandler;
}
