import type { Effect } from './Effect.ts';
export interface CustomShaderEffect extends Effect {
  kind: 'CustomShaderEffect';
  shaderKey: string;
  uniforms?: Readonly<Record<string, number | number[]>>;
}
