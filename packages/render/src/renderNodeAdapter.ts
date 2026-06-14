import { invalidateNodeAppearance } from '@flighthq/node';
import type { Node, Renderable, RenderNode2D, RenderNodeAdapter, RenderState } from '@flighthq/types';

import { installRenderAdaptHook, updateRenderNodeRenderer } from './renderNode';

let _installed = false;

export function applyRenderNodeAdapter(
  state: RenderState,
  source: Renderable,
  data: RenderNode2D & { traverseChildren: boolean },
): void {
  const renderAdapter = state.renderNodeAdapterMap.get(source) ?? null;
  let traverseChildren = true;
  if (renderAdapter !== null) {
    const result = renderAdapter.adapt(state, source, data);
    if (result !== null) {
      traverseChildren = result;
      updateRenderNodeRenderer(state, data);
    }
  }
  data.traverseChildren = traverseChildren;
}

export function getRenderNodeAdapter(state: RenderState, source: Renderable): RenderNodeAdapter | null {
  return state.renderNodeAdapterMap.get(source) ?? null;
}

export function setRenderNodeAdapter(state: RenderState, source: Renderable, adapter: RenderNodeAdapter | null): void {
  if (!_installed) {
    installRenderAdaptHook(applyRenderNodeAdapter);
    _installed = true;
  }
  if (adapter === null) {
    state.renderNodeAdapterMap.delete(source);
  } else {
    state.renderNodeAdapterMap.set(source, adapter);
  }
  invalidateNodeAppearance(source as Node);
}
