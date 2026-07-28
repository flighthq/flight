import type {
  GlRenderState,
  GlTextureBackingKind,
  GlTextureResolver,
  TextureLike,
  TextureStorage,
} from '@flighthq/types/contract';

import { bindGlImageResourceTexture, bindGlVideoTexture } from './glDraw';
import { getGlRenderStateRuntime } from './glRenderState';

// General CPU-origin 2D image matcher. More-specific backing resolvers registered later take
// precedence because resolveGlTexture walks the state registry newest-first.
export const glImageTextureBackingKind: GlTextureBackingKind = (storage: Readonly<TextureStorage>): boolean =>
  storage.dimension === '2d' && storage.image !== null;

// Host-video specialization over the same ImageResource backing family. Structural host capabilities
// avoid a public source-kind field and also work for canvas-backed test/adapter shims.
export const glVideoTextureBackingKind: GlTextureBackingKind = (storage: Readonly<TextureStorage>): boolean => {
  const source = storage.image?.source as { readyState?: unknown; videoHeight?: unknown; videoWidth?: unknown } | null;
  return source !== null && 'readyState' in source && 'videoHeight' in source && 'videoWidth' in source;
};

// Installs the ordinary ImageResource realization. It delegates upload/version caching to the
// existing backing-keyed bindGlImageResourceTexture seam and keeps Texture.sampler off that key.
export function registerGlImageTextureResolver(state: GlRenderState): void {
  registerGlTextureResolver(state, glImageTextureBackingKind, resolveGlImageTexture);
}

// Registers or replaces one backing-family resolver on this render state. The matcher function is
// the registration identity. Passing null removes it. No module-global registry exists.
export function registerGlTextureResolver(
  state: GlRenderState,
  backingKind: GlTextureBackingKind,
  resolver: GlTextureResolver | null,
): void {
  const runtime = getGlRenderStateRuntime(state);
  const registry = (runtime.glTextureResolverRegistry ??= []);
  const index = registry.findIndex((registration) => registration.backingKind === backingKind);
  if (index !== -1) registry.splice(index, 1);
  if (resolver !== null) registry.push({ backingKind, resolver });
}

// Installs the dynamic host-video specialization. Registering after the general image resolver makes
// it win the newest-first match while both continue to share the ImageResource storage shape.
export function registerGlVideoTextureResolver(state: GlRenderState): void {
  registerGlTextureResolver(state, glVideoTextureBackingKind, resolveGlVideoTexture);
}

// Resolves through the render state's open backing registry. Newest matching registration wins,
// letting video/produced/vendor backings specialize the general image match without a switch.
export function resolveGlTexture(state: GlRenderState, texture: Readonly<TextureLike>): WebGLTexture | null {
  const registry = getGlRenderStateRuntime(state).glTextureResolverRegistry;
  if (registry == null) return null;
  for (let i = registry.length - 1; i >= 0; i--) {
    const registration = registry[i];
    if (registration.backingKind(texture.storage)) return registration.resolver(state, texture);
  }
  return null;
}

function resolveGlImageTexture(state: GlRenderState, texture: Readonly<TextureLike>): WebGLTexture | null {
  const image = texture.storage.image;
  if (image === null || (image.source === null && image.data === null && image.compressed === null)) return null;
  return bindGlImageResourceTexture(state, image, texture.sampler);
}

function resolveGlVideoTexture(state: GlRenderState, texture: Readonly<TextureLike>): WebGLTexture | null {
  const source = texture.storage.image?.source as HTMLVideoElement | null | undefined;
  if (source == null || source.readyState < 2 || source.videoWidth <= 0 || source.videoHeight <= 0) return null;
  return bindGlVideoTexture(state, texture);
}
