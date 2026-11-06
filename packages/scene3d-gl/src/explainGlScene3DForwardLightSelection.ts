import type { Scene3DLightsLike } from '@flighthq/lighting/contract';
import type { Scene3DForwardLightSelectionExplanation } from '@flighthq/lighting/contract';
import { MAX_FORWARD_LIGHTS } from '@flighthq/lighting/contract';

import type { GlScene3DForwardLightList } from './contract.scene3d-gl-types.ts';

// Explains whether drawing `lights` through the fixed forward budget needs an explicit per-object
// selection list. This pure, separately importable query retains and mutates nothing.
export function explainGlScene3DForwardLightSelection(
  lights: Readonly<Scene3DLightsLike>,
  selection?: Readonly<GlScene3DForwardLightList>,
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
