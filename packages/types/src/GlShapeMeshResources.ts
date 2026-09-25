import type { GlShapeMeshColorScaleBiasShader } from './GlRenderState.ts';
import type { GlShapeMeshBinding } from './GlShapeMeshBinding.ts';

export interface GlShapeMeshResources {
  binding: GlShapeMeshBinding;
  colorMatrixShader: GlShapeMeshColorScaleBiasShader | null;
  colorScaleBiasShader: GlShapeMeshColorScaleBiasShader | null;
}
