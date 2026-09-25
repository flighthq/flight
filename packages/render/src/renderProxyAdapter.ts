import { invalidateNodeAppearance } from '@flighthq/node/contract';
import type { Node, NodeAny, RenderProxy2D, RenderProxyAdapter, RenderState } from '@flighthq/types/contract';

import { installRenderAdaptHook, updateRenderProxyRenderer } from './renderProxy.ts';
import { getRenderStateRuntime } from './renderState.ts';

export function applyRenderProxyAdapter(state: RenderState, source: NodeAny, data: RenderProxy2D): void {
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

export function getRenderProxyAdapter(state: RenderState, source: NodeAny): RenderProxyAdapter | null {
  return getRenderStateRuntime(state).renderProxyAdapterMap.get(source) ?? null;
}

export function setRenderProxyAdapter(state: RenderState, source: NodeAny, adapter: RenderProxyAdapter | null): void {
  if (getRenderStateRuntime(state).renderAdaptHook !== applyRenderProxyAdapter) {
    installRenderAdaptHook(state, applyRenderProxyAdapter);
  }
  const runtime = getRenderStateRuntime(state);
  if (adapter === null) {
    runtime.renderProxyAdapterMap.delete(source);
  } else {
    runtime.renderProxyAdapterMap.set(source, adapter);
  }
  invalidateNodeAppearance(source as Node);
}
