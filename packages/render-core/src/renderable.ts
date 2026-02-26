import { getAppearanceID, getLocalBoundsID, getWorldTransformID } from '@flighthq/stage';
import type { Renderable, RenderableData, RendererState } from '@flighthq/types';

import { createRenderableData } from './createRenderableData';

export function getRenderableData(state: RendererState, source: Renderable): RenderableData {
  const renderableDataMap = state.renderableDataMap;
  if (!renderableDataMap.has(source)) renderableDataMap.set(source, createRenderableData(source));
  return renderableDataMap.get(source)!;
}

export function updateRenderableData(data: RenderableData): void {
  const source = data.source;
  const appearanceID = getAppearanceID(source);
  const worldTransformID = getWorldTransformID(source);
  const localBoundsID = getLocalBoundsID(source);
  if (
    !data.dirty &&
    (data.appearanceID !== appearanceID ||
      data.worldTransformID !== worldTransformID ||
      data.localBoundsID !== localBoundsID)
  ) {
    data.appearanceID = appearanceID;
    data.worldTransformID = worldTransformID;
    data.localBoundsID = localBoundsID;
    data.dirty = true;
  }
}
