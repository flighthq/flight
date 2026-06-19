import { invalidateNodeAppearance } from '@flighthq/node';
import type { Node, Renderable, RenderProxy2D, RenderProxyAdapter, RenderState } from '@flighthq/types';

import { installRenderAdaptHook, updateRenderProxyRenderer } from './renderProxy';
import { getRenderStateRuntime } from './renderState';

let _installed = false;

export function applyRenderProxyAdapter(
  state: RenderState,
  source: Renderable,
  data: RenderProxy2D & { traverseChildren: boolean },
): void {
  const renderAdapter = getRenderStateRuntime(state).renderProxyAdapterMap.get(source) ?? null;
  let traverseChildren = true;
  if (renderAdapter !== null) {
    const result = renderAdapter.adapt(state, source, data);
    if (result !== null) {
      traverseChildren = result;
      updateRenderProxyRenderer(state, data);
    }
  }
  data.traverseChildren = traverseChildren;
}

export function getRenderProxyAdapter(state: RenderState, source: Renderable): RenderProxyAdapter | null {
  return getRenderStateRuntime(state).renderProxyAdapterMap.get(source) ?? null;
}

export function setRenderProxyAdapter(
  state: RenderState,
  source: Renderable,
  adapter: RenderProxyAdapter | null,
): void {
  if (!_installed) {
    installRenderAdaptHook(applyRenderProxyAdapter);
    _installed = true;
  }
  const runtime = getRenderStateRuntime(state);
  if (adapter === null) {
    runtime.renderProxyAdapterMap.delete(source);
  } else {
    runtime.renderProxyAdapterMap.set(source, adapter);
  }
  invalidateNodeAppearance(source as Node);
}
