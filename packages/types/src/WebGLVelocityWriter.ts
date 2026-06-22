import type { VelocityField } from './Velocity';
import type { GlRenderState } from './WebGLRenderState';

// Per-draw velocity production. Velocity is tied to the draw: only the thing that draws a renderable knows
// its coverage and per-instance breakdown (a QuadBatch's per-instance velocities live nowhere else). A
// GlVelocityWriter is registered per renderable Kind (registerGlVelocityWriter) and draws that
// kind's velocity into the bound velocity target during the velocity pass. It is the draw-time analog of
// a color renderer, kept as a separate concern — not the Renderer object — so the color contract stays
// clean and velocity production tree-shakes independently. The generic VelocityField (velocity data) is
// render-agnostic and lives in @flighthq/velocity; this is only the render-side hook into it.
export interface GlVelocityContext {
  readonly state: GlRenderState;
  readonly field: VelocityField;
  readonly width: number;
  readonly height: number;
  readonly pixelRatio: number;
}

export type GlVelocityWriter = (ctx: Readonly<GlVelocityContext>, node: object) => void;
