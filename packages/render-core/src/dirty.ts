import { getAppearanceID, getLocalBoundsID, getWorldTransformID } from '@flighthq/stage';
import type { RenderableData } from '@flighthq/types';

export function isRenderableDirty(data: RenderableData): boolean {
  const appearanceID = getAppearanceID(data.source);
  const worldTransformID = getWorldTransformID(data.source);
  const localBoundsID = getLocalBoundsID(data.source);
  if (
    data.appearanceID !== appearanceID ||
    data.worldTransformID !== worldTransformID ||
    data.localBoundsID !== localBoundsID
  ) {
    data.appearanceID = appearanceID;
    data.worldTransformID = worldTransformID;
    data.localBoundsID = localBoundsID;
    return true;
  }
  return false;
}
