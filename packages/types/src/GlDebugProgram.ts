import type { GlMeshProgram } from './GlMeshProgram';

// A compiled debug variant plus its resolved uniform locations. Extends GlMeshProgram (it carries the
// model + normal matrix + view-projection the vertex stage needs) with the debug fragment uniforms.
// `locNear`/`locFar` drive the depth linearization; `locNormalMap`/`locNormalScale` drive the optional
// normal-map perturbation. A given location is null in the mode/variant that does not declare it. One
// exists per distinct GlDebugDefineKey, cached on the GlRenderState under the `debug:` namespace.
export interface GlDebugProgram extends GlMeshProgram {
  locFar: WebGLUniformLocation | null;
  locNear: WebGLUniformLocation | null;
  locNormalMap: WebGLUniformLocation | null;
  locNormalScale: WebGLUniformLocation | null;
}

// The feature flags that select a debug variant. `mode` picks the depth vs normal fragment branch;
// `hasNormalMap` enables the sampled tangent-space normal-map perturbation (normal mode only — depth
// ignores it). Distinct keys compile and cache as distinct programs.
export interface GlDebugDefineKey {
  hasNormalMap: boolean;
  mode: 'depth' | 'normal';
}
