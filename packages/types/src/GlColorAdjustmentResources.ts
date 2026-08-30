import type { GlColorScaleBiasInstancedShader, GlUniformColorScaleBiasShader } from './GlRenderState';

export interface GlColorAdjustmentResources {
  matrixInstancedShader: GlColorScaleBiasInstancedShader;
  scaleBiasInstancedShader: GlColorScaleBiasInstancedShader;
  tintInstancedShader: GlColorScaleBiasInstancedShader;
  uniformScaleBiasShader: GlUniformColorScaleBiasShader;
}
