import type { Bitmap } from '@flighthq/bitmap/contract';
import type { EntityRaw, EntityRuntime, EntityRuntimeKey, Kind } from '@flighthq/entity/contract';
import type { RenderRegistryTable } from '@flighthq/render/contract';
import type { CanvasSurface, HostCanvasCapability } from '@flighthq/surface/contract';
import type { Texture, TextureSourceKind } from '@flighthq/texture/contract';

export type CanvasTextureResolver = (
  resolvers: CanvasTextureResolvers,
  texture: Readonly<Texture>,
) => CanvasImageSource | null;

// A state-independent Canvas texture-resolution set. Canvas render states and non-Canvas shape
// rasterizers can share the same registry and caches without manufacturing a render state.
export interface CanvasTextureResolvers extends EntityRaw {
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
  registryMiss?: ((registry: RenderRegistryTable, kind: Kind) => void) | null;
}
