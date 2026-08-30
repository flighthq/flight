import { getTextureHeight, getTextureWidth } from '@flighthq/texture/contract';
import type { CanvasTextureResolvers, Texture } from '@flighthq/types/contract';

import { acquireCanvasTextureResolverSurface, resolveCanvasTexture } from './canvasTextureResolver';

// Resolves a Texture's uv window as a standalone drawable for Canvas patterns. Identity windows
// return the source directly. Sub-rect/flip windows are materialized once per render state and
// refreshed when either the source or Texture state changes. A null state supports host-backed
// raster fallbacks without retaining any source-specific transcode.
export function resolveCanvasTextureWindowSource(
  resolvers: CanvasTextureResolvers,
  texture: Readonly<Texture>,
): CanvasImageSource | null {
  if (texture.dimension !== '2d') return null;
  const image = texture.source;
  const source = resolveCanvasTexture(resolvers, texture);
  if (source === null) return null;

  const uvOffsetX = texture.uvOffset.x;
  const uvOffsetY = texture.uvOffset.y;
  const uvRotation = texture.uvRotation;
  const uvScaleX = texture.uvScale.x;
  const uvScaleY = texture.uvScale.y;
  if (
    uvOffsetX === 0 &&
    uvOffsetY === 0 &&
    uvScaleX === 1 &&
    uvScaleY === 1 &&
    !texture.flipX &&
    !texture.flipY &&
    uvRotation === 0
  ) {
    return source;
  }

  const backingWidth = getTextureWidth(texture);
  const backingHeight = getTextureHeight(texture);
  const sourceWidth = Math.abs(uvScaleX * backingWidth);
  const sourceHeight = Math.abs(uvScaleY * backingHeight);
  if (backingWidth <= 0 || backingHeight <= 0 || sourceWidth <= 0 || sourceHeight <= 0) return null;

  const imageVersion = image?.version ?? -1;
  const cache = (resolvers.textureWindowElementCache ??= new WeakMap());
  let entry = cache?.get(texture);
  if (
    entry !== undefined &&
    entry.source === source &&
    entry.imageVersion === imageVersion &&
    entry.textureVersion === texture.version &&
    entry.uvOffsetX === uvOffsetX &&
    entry.uvOffsetY === uvOffsetY &&
    entry.uvRotation === uvRotation &&
    entry.uvScaleX === uvScaleX &&
    entry.uvScaleY === uvScaleY &&
    entry.flipX === texture.flipX &&
    entry.flipY === texture.flipY
  ) {
    return entry.element;
  }

  const surface = acquireCanvasTextureResolverSurface(resolvers, {
    height: Math.max(1, Math.ceil(sourceHeight)),
    pixelRatio: 1,
    width: Math.max(1, Math.ceil(sourceWidth)),
  });
  if (surface === null) return null;
  const { canvas: element, context } = surface;
  context.imageSmoothingEnabled = !texture.sampler.magFilter.startsWith('nearest');

  const sourceX = Math.min(uvOffsetX * backingWidth, (uvOffsetX + uvScaleX) * backingWidth);
  const sourceY = Math.min(uvOffsetY * backingHeight, (uvOffsetY + uvScaleY) * backingHeight);
  const flipX = texture.flipX !== uvScaleX < 0;
  const flipY = texture.flipY !== uvScaleY < 0;
  context.save();
  context.translate(flipX ? element.width : 0, flipY ? element.height : 0);
  context.scale(flipX ? -1 : 1, flipY ? -1 : 1);
  context.drawImage(source, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, element.width, element.height);
  context.restore();

  entry = {
    element,
    flipX: texture.flipX,
    flipY: texture.flipY,
    imageVersion,
    source,
    surface,
    textureVersion: texture.version,
    uvOffsetX,
    uvOffsetY,
    uvRotation,
    uvScaleX,
    uvScaleY,
  };
  cache?.set(texture, entry);
  return element;
}
