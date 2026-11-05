import type { Scene3DForwardLightSelectionExplanation, Scene3DLightsLike } from '@flighthq/types/contract';
import { MAX_FORWARD_LIGHTS } from '@flighthq/types/contract';

import type { WgpuScene3DForwardLightList } from './contract.scene3d-wgpu-types.ts';

// Pure diagnostic twin of scene-gl's explanation API.
export function explainWgpuScene3DForwardLightSelection(
  lights: Readonly<Scene3DLightsLike>,
  selection?: Readonly<WgpuScene3DForwardLightList>,
): Scene3DForwardLightSelectionExplanation {
  const pointLightCount = lights.point?.length ?? 0;
  const spotLightCount = lights.spot?.length ?? 0;
  const selectionPrepared = selection !== undefined;
  return {
    pointLightCount,
    reason: selectionPrepared
      ? 'selection-prepared'
      : pointLightCount > MAX_FORWARD_LIGHTS || spotLightCount > MAX_FORWARD_LIGHTS
        ? 'selection-required'
        : 'within-budget',
    selectionPrepared,
    spotLightCount,
  };
}
