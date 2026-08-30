import type { GlShapeMeshBinding } from './GlShapeMeshBinding';
import type { GlShapeMeshColorScaleBiasShader } from './GlRenderState';

export interface GlShapeMeshResources {
  binding: GlShapeMeshBinding;
  colorMatrixShader: GlShapeMeshColorScaleBiasShader | null;
  colorScaleBiasShader: GlShapeMeshColorScaleBiasShader | null;
}
