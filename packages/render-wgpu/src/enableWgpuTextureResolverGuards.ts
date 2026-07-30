import { logOnce } from '@flighthq/log/contract';
import { getTextureSourceKind } from '@flighthq/texture/contract';
import type {
  TextureSourceKind,
  TextureLike,
  WgpuRenderState,
  WgpuTextureEntry,
  WgpuTextureResolver,
} from '@flighthq/types/contract';
import { LogLevel } from '@flighthq/types/contract';

import { getWgpuRenderStateRuntime } from './wgpuRenderState';

export function areWgpuTextureResolverGuardsEnabled(state: WgpuRenderState): boolean {
  return getWgpuRenderStateRuntime(state).wgpuTextureResolverRegistry instanceof GuardedWgpuTextureResolverRegistry;
}

export function enableWgpuTextureResolverGuards(state: WgpuRenderState): void {
  const runtime = getWgpuRenderStateRuntime(state);
  if (runtime.wgpuTextureResolverRegistry instanceof GuardedWgpuTextureResolverRegistry) return;
  const guarded = new GuardedWgpuTextureResolverRegistry();
  runtime.wgpuTextureResolverRegistry?.forEach((resolver, kind) => guarded.set(kind, resolver));
  runtime.wgpuTextureResolverRegistry = guarded;
}

class GuardedWgpuTextureResolverRegistry extends Map<TextureSourceKind, WgpuTextureResolver> {
  override get(kind: TextureSourceKind): WgpuTextureResolver | undefined {
    return super.get(kind) ?? warnMissingWgpuTextureResolver;
  }
}

function warnMissingWgpuTextureResolver(
  _state: WgpuRenderState,
  texture: Readonly<TextureLike>,
): WgpuTextureEntry | null {
  const kind = getTextureSourceKind(texture);
  if (kind === null) return null;
  logOnce(
    `render-wgpu:texture-resolver-missing:${kind}`,
    LogLevel.Warn,
    {
      kind,
      message:
        'resolveWgpuTexture: texture source kind has no registered resolver — call registerWgpuTextureResolver(state, sourceKind, resolver)',
      texture,
    },
    'render-wgpu',
  );
  return null;
}
