import type { VelocityField } from './Velocity';
import type { WgpuRenderState } from './WebGPURenderState';

// Per-draw velocity production, the Wgpu mirror of GlVelocityWriter. Velocity is tied to the draw:
// only the thing that draws a renderable knows its coverage and per-instance breakdown (a QuadBatch's
// per-instance velocities live nowhere else). A WgpuVelocityWriter is registered per renderable Kind
// (registerWgpuVelocityWriter) and draws that kind's velocity into the bound velocity target during the
// velocity pass. It is the draw-time analog of a color renderer, kept as a separate concern so the color
// contract stays clean and velocity production tree-shakes independently. The generic VelocityField
// (velocity data) is render-agnostic and lives in @flighthq/velocity; this is only the render-side hook.
export interface WgpuVelocityContext {
  readonly state: WgpuRenderState;
  readonly field: VelocityField;
  readonly width: number;
  readonly height: number;
  readonly pixelRatio: number;
}

export type WgpuVelocityWriter = (ctx: Readonly<WgpuVelocityContext>, node: object) => void;
