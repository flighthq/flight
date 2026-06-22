import type { GodRaysEffect, ScreenSpaceFogEffect, SsaoEffect, SsrEffect } from '@flighthq/types';

// Atmospheric / depth effect intents. Each is plain data with a `type` discriminant; the Gl recipes
// register runners against that type. Several of these (fog, SSAO, SSR) are tagged [DEPTH] in the type
// layer because their canonical form reads a sampleable depth (and normals) texture; the Gl backend
// ships color-only approximations until depth/normal inputs are threaded through the effect context.

export function createGodRaysEffect(options: Readonly<Omit<GodRaysEffect, 'type'>> = {}): GodRaysEffect {
  return { type: 'godRays', ...options };
}

export function createScreenSpaceFogEffect(
  options: Readonly<Omit<ScreenSpaceFogEffect, 'type'>> = {},
): ScreenSpaceFogEffect {
  return { type: 'screenSpaceFog', ...options };
}

export function createSsaoEffect(options: Readonly<Omit<SsaoEffect, 'type'>> = {}): SsaoEffect {
  return { type: 'ssao', ...options };
}

export function createSsrEffect(options: Readonly<Omit<SsrEffect, 'type'>> = {}): SsrEffect {
  return { type: 'ssr', ...options };
}
