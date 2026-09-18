import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { createViewport } from '@flighthq/node/contract';
import type {
  AppRenderViewTargetOptions,
  GlContext,
  GlRenderOptions,
  GlRenderRegistry,
  GlRenderViewResources,
} from '@flighthq/types/contract';

import { createGlRenderState, destroyGlRenderState, invalidateGlRenderStateCache } from './glRenderState';
import {
  createGlTextureRenderTarget,
  destroyGlTextureRenderTarget,
  resizeGlTextureRenderTarget,
} from './glRenderTarget';

// The render-layer half of a GL application view. A caller acquires a context (host.gl for a
// provider-bound target) and passes it here; the window half and the resize reconciliation belong to
// @flighthq/app, which this package may not import — so the two are joined at the call site
// rather than by an assembly package.
//
// The canvas backing store is NOT sized here. A caller that owns the surface sizes it first, through
// host.surface.resize, then calls resizeGlRenderViewResources with the same extent.
export function createGlRenderViewResources(
  context: GlContext,
  registry: Readonly<GlRenderRegistry>,
  width: number,
  height: number,
  devicePixelRatio: number,
  render: Readonly<GlRenderOptions> = {},
  target: Readonly<AppRenderViewTargetOptions> = {},
): GlRenderViewResources {
  const out = allocateEntity<GlRenderViewResources>();
  out.renderState = createGlRenderState(context, registry, { ...render, pixelRatio: devicePixelRatio });
  out.renderTarget = createGlTextureRenderTarget(out.renderState, { ...target, height, width });
  out.viewport = createViewport({ devicePixelRatio, height, width });
  return finishEntity(out);
}

// Frees the storage and command state this builder allocated. The context stays caller-owned: host.gl
// acquired it and releases it through the matching release hook.
export function destroyGlRenderViewResources(resources: Readonly<GlRenderViewResources>): void {
  destroyGlTextureRenderTarget(resources.renderTarget);
  destroyGlRenderState(resources.renderState);
}

// Reallocates storage for a new device-pixel extent and drops the state's extent-dependent caches.
// Idempotent: a request matching the current storage extent is a no-op, which is what the application
// synchronize pass requires.
export function resizeGlRenderViewResources(
  resources: Readonly<GlRenderViewResources>,
  width: number,
  height: number,
): void {
  const storageWidth = Math.max(1, Math.ceil(width));
  const storageHeight = Math.max(1, Math.ceil(height));
  if (resources.renderTarget.width === storageWidth && resources.renderTarget.height === storageHeight) return;
  invalidateGlRenderStateCache(resources.renderState);
  resizeGlTextureRenderTarget(resources.renderState, resources.renderTarget, width, height);
}
