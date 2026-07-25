import type {
  Scene3DForwardLightSelectionExplanation,
  Scene3DLightsLike,
  WgpuScene3DForwardLightList,
} from '@flighthq/types';
import { MAX_FORWARD_LIGHTS } from '@flighthq/types';

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
