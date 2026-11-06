// Render GL owns these resource identities because GlRenderState embeds them. Re-exporting the owner
// contracts keeps the scene2d-gl entry convenient without duplicating structurally compatible shapes.
export type {
  GlColorAdjustmentResources,
  GlParticleResources,
  GlQuadBatchResources,
  GlShapeMesh,
  GlShapeMeshBinding,
  GlShapeMeshResources,
} from '@flighthq/render-gl/contract';
