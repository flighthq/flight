import type { Effect } from './Effect';
export interface CustomShaderEffect extends Effect {
  kind: 'CustomShaderEffect';
  shaderKey: string;
  uniforms?: Readonly<Record<string, number | number[]>>;
}
