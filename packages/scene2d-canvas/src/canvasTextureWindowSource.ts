import { getTextureHeight, getTextureViewSize, getTextureWidth } from '@flighthq/texture/contract';
import type { CanvasTextureResolvers, Texture } from '@flighthq/types/contract';

import { acquireCanvasTextureResolverSurface, resolveCanvasTexture } from './canvasTextureResolver';
import { drawCanvasTextureView } from './canvasTextureView';

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
  getTextureViewSize(textureWindowViewSize, texture);
  const viewWidth = textureWindowViewSize.x;
  const viewHeight = textureWindowViewSize.y;
  if (backingWidth <= 0 || backingHeight <= 0 || viewWidth <= 0 || viewHeight <= 0) return null;

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
    height: Math.max(1, Math.ceil(viewHeight)),
    pixelRatio: 1,
    width: Math.max(1, Math.ceil(viewWidth)),
  });
  if (surface === null) return null;
  const { canvas: element, context } = surface;
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, element.width, element.height);
  context.imageSmoothingEnabled = !texture.sampler.magFilter.startsWith('nearest');
  drawCanvasTextureView(context, source, texture, element.width, element.height);

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

const textureWindowViewSize = { x: 0, y: 0 };
