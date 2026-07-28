import type {
  GlRenderState,
  GlTextureBackingKind,
  GlTextureResolver,
  Texture,
  TextureLike,
} from '@flighthq/types/contract';
import { ImageTextureBackingKind, ProducedTextureBackingKind, VideoTextureBackingKind } from '@flighthq/types/contract';

import { bindGlImageResourceTexture, bindGlVideoTexture } from './glDraw';
import { getGlRenderStateRuntime } from './glRenderState';
import { bindGlRenderTexture } from './glRenderTexture';

// Built-in declared backing keys. These aliases keep GL call sites self-identifying while the string
// values are shared with other backends.
export const glImageTextureBackingKind: GlTextureBackingKind = ImageTextureBackingKind;

export const glProducedTextureBackingKind: GlTextureBackingKind = ProducedTextureBackingKind;

export const glVideoTextureBackingKind: GlTextureBackingKind = VideoTextureBackingKind;

// Installs the ordinary ImageResource realization. It delegates upload/version caching to the
// existing backing-keyed bindGlImageResourceTexture seam and keeps Texture.sampler off that key.
export function registerGlImageTextureResolver(state: GlRenderState): void {
  registerGlTextureResolver(state, glImageTextureBackingKind, resolveGlImageTexture);
}

// Installs the produced-target realization.
export function registerGlProducedTextureResolver(state: GlRenderState): void {
  registerGlTextureResolver(state, glProducedTextureBackingKind, resolveGlProducedTexture);
}

// Registers or replaces one declared backing-kind resolver on this render state. Map.set is
// last-write-wins; passing null removes the key. No registration ordering or matcher scan exists.
export function registerGlTextureResolver(
  state: GlRenderState,
  backingKind: GlTextureBackingKind,
  resolver: GlTextureResolver | null,
): void {
  const runtime = getGlRenderStateRuntime(state);
  const registry = (runtime.glTextureResolverRegistry ??= new Map());
  if (resolver === null) registry.delete(backingKind);
  else registry.set(backingKind, resolver);
}

// Installs the dynamic host-video specialization.
export function registerGlVideoTextureResolver(state: GlRenderState): void {
  registerGlTextureResolver(state, glVideoTextureBackingKind, resolveGlVideoTexture);
}

// Resolves through one keyed lookup using the backing's declared kind. The CPU backing owns its kind;
// a GPU-origin target owns its own. An unbound or undeclared backing is the null sentinel.
export function resolveGlTexture(state: GlRenderState, texture: Readonly<TextureLike>): WebGLTexture | null {
  const registry = getGlRenderStateRuntime(state).glTextureResolverRegistry;
  if (registry == null) return null;
  const backingKind = texture.storage.image?.kind ?? texture.storage.target?.kind;
  if (backingKind === undefined) return null;
  return registry.get(backingKind)?.(state, texture) ?? null;
}

function resolveGlImageTexture(state: GlRenderState, texture: Readonly<TextureLike>): WebGLTexture | null {
  const image = texture.storage.image;
  if (image === null || (image.source === null && image.data === null && image.compressed === null)) return null;
  return bindGlImageResourceTexture(state, image, texture.sampler);
}

function resolveGlProducedTexture(state: GlRenderState, texture: Readonly<TextureLike>): WebGLTexture | null {
  return bindGlRenderTexture(state, texture as Readonly<Texture>);
}

function resolveGlVideoTexture(state: GlRenderState, texture: Readonly<TextureLike>): WebGLTexture | null {
  const source = texture.storage.image?.source as HTMLVideoElement | null | undefined;
  if (source == null || source.readyState < 2 || source.videoWidth <= 0 || source.videoHeight <= 0) return null;
  return bindGlVideoTexture(state, texture);
}
