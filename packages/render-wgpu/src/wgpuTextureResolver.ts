import type {
  Texture,
  TextureLike,
  WgpuRenderState,
  WgpuTextureBackingKind,
  WgpuTextureEntry,
  WgpuTextureResolver,
} from '@flighthq/types/contract';
import { ImageTextureBackingKind, ProducedTextureBackingKind, VideoTextureBackingKind } from '@flighthq/types/contract';

import { bindWgpuImageResourceTexture, bindWgpuVideoTexture } from './wgpuDraw';
import { getWgpuRenderStateRuntime } from './wgpuRenderState';
import { bindWgpuRenderTexture } from './wgpuRenderTexture';

// Built-in declared backing keys. These aliases keep WebGPU call sites self-identifying while the
// string values are shared with other backends.
export const wgpuImageTextureBackingKind: WgpuTextureBackingKind = ImageTextureBackingKind;

export const wgpuProducedTextureBackingKind: WgpuTextureBackingKind = ProducedTextureBackingKind;

export const wgpuVideoTextureBackingKind: WgpuTextureBackingKind = VideoTextureBackingKind;

export function registerWgpuImageTextureResolver(state: WgpuRenderState): void {
  registerWgpuTextureResolver(state, wgpuImageTextureBackingKind, resolveWgpuImageTexture);
}

export function registerWgpuProducedTextureResolver(state: WgpuRenderState): void {
  registerWgpuTextureResolver(state, wgpuProducedTextureBackingKind, resolveWgpuProducedTexture);
}

// Registers or replaces one declared backing-kind resolver on this render state. Map.set is
// last-write-wins; passing null removes the key.
export function registerWgpuTextureResolver(
  state: WgpuRenderState,
  backingKind: WgpuTextureBackingKind,
  resolver: WgpuTextureResolver | null,
): void {
  const runtime = getWgpuRenderStateRuntime(state);
  const registry = (runtime.wgpuTextureResolverRegistry ??= new Map());
  if (resolver === null) registry.delete(backingKind);
  else registry.set(backingKind, resolver);
}

export function registerWgpuVideoTextureResolver(state: WgpuRenderState): void {
  registerWgpuTextureResolver(state, wgpuVideoTextureBackingKind, resolveWgpuVideoTexture);
}

// Resolves through one keyed lookup using the backing's declared kind.
export function resolveWgpuTexture(state: WgpuRenderState, texture: Readonly<TextureLike>): WgpuTextureEntry | null {
  const registry = getWgpuRenderStateRuntime(state).wgpuTextureResolverRegistry;
  if (registry == null) return null;
  const backingKind = texture.storage.image?.kind ?? texture.storage.target?.kind;
  if (backingKind === undefined) return null;
  return registry.get(backingKind)?.(state, texture) ?? null;
}

function resolveWgpuImageTexture(state: WgpuRenderState, texture: Readonly<TextureLike>): WgpuTextureEntry | null {
  const image = texture.storage.image;
  if (image === null || (image.source === null && image.data === null && image.compressed === null)) return null;
  return bindWgpuImageResourceTexture(state, image, texture.sampler.mipmaps);
}

function resolveWgpuProducedTexture(state: WgpuRenderState, texture: Readonly<TextureLike>): WgpuTextureEntry | null {
  return bindWgpuRenderTexture(state, texture as Readonly<Texture>);
}

function resolveWgpuVideoTexture(state: WgpuRenderState, texture: Readonly<TextureLike>): WgpuTextureEntry | null {
  return bindWgpuVideoTexture(state, texture as Readonly<Texture>);
}
