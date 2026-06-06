import { invalidateAppearance } from '@flighthq/scene';
import type { Renderable, RenderNode2D, RenderNodeAdapter, RenderState, SceneNode } from '@flighthq/types';

import { installAdaptHook, syncRenderNodeRenderer } from './renderNode';

const _adapters = new WeakMap<Renderable, RenderNodeAdapter>();
let _installed = false;

export function adaptRenderNode(
  state: RenderState,
  source: Renderable,
  data: RenderNode2D & { traverseChildren: boolean },
): void {
  const renderAdapter = _adapters.get(source) ?? null;
  let traverseChildren = true;
  if (renderAdapter !== null) {
    const result = renderAdapter.adapt(state, source, data);
    if (result !== null) {
      traverseChildren = result;
      syncRenderNodeRenderer(state, data);
    }
  }
  data.traverseChildren = traverseChildren;
}

export function getRenderNodeAdapter(source: Renderable): RenderNodeAdapter | null {
  return _adapters.get(source) ?? null;
}

export function setRenderNodeAdapter(source: Renderable, adapter: RenderNodeAdapter | null): void {
  if (!_installed) {
    installAdaptHook(adaptRenderNode);
    _installed = true;
  }
  if (adapter === null) {
    _adapters.delete(source);
  } else {
    _adapters.set(source, adapter);
  }
  invalidateAppearance(source as SceneNode);
}
