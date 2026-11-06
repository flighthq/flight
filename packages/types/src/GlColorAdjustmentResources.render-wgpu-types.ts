import type { GlColorScaleBiasInstancedShader, GlUniformColorScaleBiasShader } from './GlRenderState.ts';

export interface GlColorAdjustmentResources {
  matrixInstancedShader: GlColorScaleBiasInstancedShader;
  scaleBiasInstancedShader: GlColorScaleBiasInstancedShader;
  tintInstancedShader: GlColorScaleBiasInstancedShader;
  uniformScaleBiasShader: GlUniformColorScaleBiasShader;
}
