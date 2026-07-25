import type {
  SceneForwardLightSelectionExplanation,
  SceneLightsLike,
  WgpuSceneForwardLightList,
} from '@flighthq/types';
import { MAX_FORWARD_LIGHTS } from '@flighthq/types';

// Pure diagnostic twin of scene-gl's explanation API.
export function explainWgpuSceneForwardLightSelection(
  lights: Readonly<SceneLightsLike>,
  selection?: Readonly<WgpuSceneForwardLightList>,
): SceneForwardLightSelectionExplanation {
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
