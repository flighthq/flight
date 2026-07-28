import type {
  GlRenderState,
  GlTextureBackingKind,
  GlTextureResolver,
  TextureLike,
  TextureStorage,
} from '@flighthq/types/contract';

import { bindGlImageResourceTexture } from './glDraw';
import { getGlRenderStateRuntime } from './glRenderState';

// General CPU-origin 2D image matcher. More-specific backing resolvers registered later take
// precedence because resolveGlTexture walks the state registry newest-first.
export const glImageTextureBackingKind: GlTextureBackingKind = (storage: Readonly<TextureStorage>): boolean =>
  storage.dimension === '2d' && storage.image !== null;

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
