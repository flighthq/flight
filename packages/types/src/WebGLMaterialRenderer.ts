import type { Material, MaterialData } from './Material';
import type { GlRenderState } from './WebGLRenderState';

// Per-backend behavior for a material kind on Gl, registered against the kind on the
// render state via registerGlMaterialRenderer. The renderer owns its shader (program and
// uniform/attribute locations) and any per-render-state batch buffer it needs.
//
// A material may use only per-batch uniforms (instanceFloatCount = 0, no packInstance), it
// may extend the per-instance layout and populate it from its own sources (a random seed, a
// time value), or it may extend the layout and read each node's traits to populate it. The
// three cases share one interface; ColorTransformMaterial and UniformColorTransformMaterial
// are the degenerate ends of it.
//
// instanceFloatCount is the number of per-instance attribute floats this material appends to
// the standard instance record. The material's attributes live in its own instance buffer
// (divisor 1), parallel to the geometry renderer's base buffer; the two share only the
// instance count, so the base instance layout (locations 1–6) stays a fixed contract that
// material shaders extend from location 7 upward. A material may not change the base geometry
// or topology — that remains graph-kind territory.
export interface GlMaterialRenderer {
  readonly instanceFloatCount: number;

  // Bind the program, upload per-batch uniforms, and set up this material's vertex attributes.
  // Called once per flush — there is exactly one material per batch. `material` is null only for
  // the default renderer (a node with no material resolved to DefaultMaterialKind).
  bind(state: GlRenderState, material: Readonly<Material> | null): void;

  // Convert one instance's `materialData` value into instanceFloatCount floats written at
  // out[offset..]. Called once per accumulated instance during batch packing; the geometry
  // renderer supplies the per-instance materialData (per-quad for QuadBatch, node-level for a
  // single Sprite). Omitted by uniform-only materials (instanceFloatCount = 0).
  packInstance?(state: GlRenderState, materialData: MaterialData | null, out: Float32Array, offset: number): void;
}
