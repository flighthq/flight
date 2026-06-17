import type { HasMaterial, RenderNode, RenderState } from '@flighthq/types';

// Resolves a node's material and its per-node material data onto the render node. Non-inheriting: a
// node uses its own material (or none → the default pipeline). Called for every node in the render
// walk — materials are a core feature, not opt-in.
export function updateRenderNodeMaterial(state: RenderState, data: RenderNode, _parentData?: RenderNode): void {
  const source = data.source as Partial<HasMaterial>;
  data.material = source.material ?? null;
  data.materialData = source.materialData ?? null;
}
