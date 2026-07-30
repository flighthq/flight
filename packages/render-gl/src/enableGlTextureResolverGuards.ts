import { logOnce } from '@flighthq/log/contract';
import { getTextureSourceKind } from '@flighthq/texture/contract';
import type { GlRenderState, GlTextureResolver, TextureSourceKind, TextureLike } from '@flighthq/types/contract';
import { LogLevel } from '@flighthq/types/contract';

import { getGlRenderStateRuntime } from './glRenderState';

export function areGlTextureResolverGuardsEnabled(state: GlRenderState): boolean {
  return getGlRenderStateRuntime(state).glTextureResolverRegistry instanceof GuardedGlTextureResolverRegistry;
}

export function enableGlTextureResolverGuards(state: GlRenderState): void {
  const runtime = getGlRenderStateRuntime(state);
  if (runtime.glTextureResolverRegistry instanceof GuardedGlTextureResolverRegistry) return;
  const guarded = new GuardedGlTextureResolverRegistry();
  runtime.glTextureResolverRegistry?.forEach((resolver, kind) => guarded.set(kind, resolver));
  runtime.glTextureResolverRegistry = guarded;
}

class GuardedGlTextureResolverRegistry extends Map<TextureSourceKind, GlTextureResolver> {
  override get(kind: TextureSourceKind): GlTextureResolver | undefined {
    return super.get(kind) ?? warnMissingGlTextureResolver;
  }
}

function warnMissingGlTextureResolver(_state: GlRenderState, texture: Readonly<TextureLike>): WebGLTexture | null {
  const kind = getTextureSourceKind(texture);
  if (kind === null) return null;
  logOnce(
    `render-gl:texture-resolver-missing:${kind}`,
    LogLevel.Warn,
    {
      kind,
      message:
        'resolveGlTexture: texture source kind has no registered resolver — call registerGlTextureResolver(state, sourceKind, resolver)',
      texture,
    },
    'render-gl',
  );
  return null;
}
