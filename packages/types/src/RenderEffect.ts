import type { Kind } from './Entity';

// Substrate-agnostic render-effect intents. Each is plain data carrying a `kind` discriminant; per-backend
// recipes register a runner against that `kind` (registerGlRenderEffect) and the effect pipeline
// dispatches an agnostic RenderEffect[] through the registry, so one intent list drives every backend.
// RenderEffect is an open base contract: a new effect is added by defining its interface (extending
// RenderEffect with a literal `kind`) and registering a runner — no central union to edit here.
// Colors are packed RGBA integers (e.g. 0x000000ff). Tags in comments mark inputs a recipe needs
// beyond color: [HDR] float target, [DEPTH] sampleable depth, [MOTION] motion vectors, [TEMPORAL] history.

// Open base contract for every render effect. The `kind` is the canonical PascalCase type name and the
// registry key a per-backend runner is registered against.
export interface RenderEffect {
  kind: Kind;
}
