import type { HasMaterial, MaterialHooks, RenderNode, RenderState } from '@flighthq/types';

export function enableMaterialSupport(state: RenderState): void {
  state.materialHooks = materialHooks;
}

// Resolves a node's material and its per-node material data onto the render node. Non-inheriting:
// a node uses its own material (or none → the default pipeline). Parent material does not flow to
// children — a shader is an object-level choice, unlike alpha or color transform which compound
// down the tree.
export function updateRenderNodeMaterial(state: RenderState, data: RenderNode, _parentData?: RenderNode): void {
  const source = data.source as Partial<HasMaterial>;
  data.material = source.material ?? null;
  data.materialData = source.materialData ?? null;
}

const materialHooks: MaterialHooks = {
  update(state: RenderState, data: RenderNode, parentData: RenderNode | undefined): void {
    updateRenderNodeMaterial(state, data, parentData);
  },
};
