import type { Bitmap } from './Bitmap';
import type { CanvasRenderSurfaceCreator } from './CanvasRenderSurface';
import type { CanvasRenderSurface } from './CanvasRenderSurface';
import type { Kind } from './Entity';
import type { Entity } from './Entity';
import type { RenderRegistry } from './RenderRegistrySignals';
import type { Texture } from './Texture';
import type { TextureSourceKind } from './TextureSourceKind';

export type CanvasTextureResolver = (
  resolvers: CanvasTextureResolvers,
  texture: Readonly<Texture>,
) => CanvasImageSource | null;

// Turns a Texture into something a 2D context can draw: the per-source-kind registry, plus the caches
// that make repeated resolution cheap.
//
// This is a primitive of its own rather than a field of a render state because two different things
// need it. A Canvas renderer resolves textures to draw them; a GPU or DOM backend's shape rasterizer
// resolves the same textures to paint fills it has no tessellated form for — and that one draws into no
// canvas of its own, so demanding a whole render state from it would mean conjuring a canvas that is
// never drawn to. Sharing one set between the two also shares one transcode cache.
//
// A resolver that genuinely needs a render state — a render-target texture belongs to the state that
// owns the target — captures that state when it is registered.
export interface CanvasTextureResolvers extends Entity {
  readonly surfaceCreator: Readonly<CanvasRenderSurfaceCreator>;
  // Undefined until the first explicit registration, so a bundle only retains the backing realizations
  // it installs.
  registry?: Map<TextureSourceKind, CanvasTextureResolver> | null;
  // The drawable HTMLCanvasElement materialized from a Bitmap. Absent until a Bitmap is resolved.
  bitmapElementCache?: WeakMap<Bitmap, { element: HTMLCanvasElement; version: number }>;
  // A Texture uv window materialized as a standalone canvas for pattern fills. Identity windows return
  // their backing source directly and never enter this cache.
  textureWindowElementCache?: WeakMap<
    Texture,
    {
      element: HTMLCanvasElement;
      surface: CanvasRenderSurface;
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
  // The opt-in miss seam, wired by whoever owns this set — a render state points it at its own emitter,
  // so a source kind with no resolver is reported through the same lane every other registry uses
  // instead of resolving to a silent null.
  registryMiss?: ((registry: RenderRegistry, kind: Kind) => void) | null;
}
