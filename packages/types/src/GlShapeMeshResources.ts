import type { GlShapeMeshColorScaleBiasShader } from './GlRenderState';
import type { GlShapeMeshBinding } from './GlShapeMeshBinding';

export interface GlShapeMeshResources {
  binding: GlShapeMeshBinding;
  colorMatrixShader: GlShapeMeshColorScaleBiasShader | null;
  colorScaleBiasShader: GlShapeMeshColorScaleBiasShader | null;
}
