import type { RenderEffect } from './RenderEffect';
export interface CustomShaderEffect extends RenderEffect {
  kind: 'CustomShaderEffect';
  shaderKey: string;
  uniforms?: Readonly<Record<string, number | number[]>>;
}
