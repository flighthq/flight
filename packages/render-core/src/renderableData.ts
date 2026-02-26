import { getAppearanceID, getLocalBoundsID, getWorldTransformID } from '@flighthq/stage';
import type { RenderableData } from '@flighthq/types';

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
