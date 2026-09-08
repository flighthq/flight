import type {
  BoundingSphereLike,
  PointLight,
  Scene3DForwardLightSelection,
  Scene3DLightsLike,
  SpotLight,
} from '@flighthq/types/contract';
import { ALL_LIGHT_LAYERS, MAX_FORWARD_LIGHTS } from '@flighthq/types/contract';

import { getLightContributionAtBoundingSphere } from './lightAnalysis';

// Selects the strongest point and spot contributors for one object's forward-light budget. Each
// family has its own MAX_FORWARD_LIGHTS budget, matching the shader's separate fixed arrays and
// counts. Ranking uses descriptor-side shader-equivalent attenuation at `bounds`; equal scores
// retain their family input order, making captures reproducible. Zero-contribution lights are
// omitted.
//
// `out.point` and `out.spot` are reused mutable arrays. All inputs are read into fixed-size scratch
// before either output array is changed, so `out` may alias `lights`.
export function selectScene3DForwardLights(
  out: Scene3DForwardLightSelection,
  lights: Readonly<Scene3DLightsLike>,
  bounds: Readonly<BoundingSphereLike>,
  receiverLayerMask: number = ALL_LIGHT_LAYERS,
): void {
  const points = lights.point;
  const spots = lights.spot;
  const pointCount = selectStrongestLights(
    points,
    bounds,
    receiverLayerMask,
    scratchSelectedPointLights,
    scratchSelectedPointIndices,
    scratchSelectedPointScores,
    scratchSelectedPointPriorities,
  );
  const spotCount = selectStrongestLights(
    spots,
    bounds,
    receiverLayerMask,
    scratchSelectedSpotLights,
    scratchSelectedSpotIndices,
    scratchSelectedSpotScores,
    scratchSelectedSpotPriorities,
  );

  const outPoints = out.point;
  const outSpots = out.spot;
  const outIndices = out.indices;
  outIndices.length = 0;
  outPoints.length = 0;
  outSpots.length = 0;
  for (let i = 0; i < pointCount; i++) {
    outIndices.push(scratchSelectedPointIndices[i]);
    outPoints.push(scratchSelectedPointLights[i] as Readonly<PointLight>);
  }
  for (let i = 0; i < spotCount; i++) {
    // Bitwise complement makes every spot key negative and every point key non-negative, so two
    // selections with the same family-local index cannot collide during block deduplication.
    outIndices.push(~scratchSelectedSpotIndices[i]);
    outSpots.push(scratchSelectedSpotLights[i] as Readonly<SpotLight>);
  }
}

function selectStrongestLights(
  lights: readonly Readonly<PointLight | SpotLight>[] | undefined,
  bounds: Readonly<BoundingSphereLike>,
  receiverLayerMask: number,
  selectedLights: Readonly<PointLight | SpotLight>[],
  selectedIndices: Int32Array,
  selectedScores: Float64Array,
  selectedPriorities: Float64Array,
): number {
  let selectedCount = 0;
  if (lights === undefined) return selectedCount;

  for (let inputIndex = 0; inputIndex < lights.length; inputIndex++) {
    const light = lights[inputIndex];
    // Layer scoping filters BEFORE ranking: a light the receiver cannot see must not occupy a budget
    // slot a light it can see would have taken.
    if ((light.layerMask & receiverLayerMask) === 0) continue;
    const score = getLightContributionAtBoundingSphere(light, bounds);
    if (!(score > 0)) continue;

    const priority = light.priority;
    let insertAt = selectedCount;
    while (insertAt > 0) {
      const previous = insertAt - 1;
      // Priority outranks contribution, and contribution breaks ties within one priority. With every
      // light at the default 0 this reduces to the previous pure-contribution order exactly, which is
      // what makes the field additive rather than a behaviour change.
      if (priority < selectedPriorities[previous]) break;
      if (priority === selectedPriorities[previous]) {
        if (score < selectedScores[previous]) break;
        if (score === selectedScores[previous] && inputIndex > selectedIndices[previous]) break;
      }
      insertAt--;
    }
    if (insertAt >= MAX_FORWARD_LIGHTS) continue;

    const nextCount = Math.min(selectedCount + 1, MAX_FORWARD_LIGHTS);
    for (let i = nextCount - 1; i > insertAt; i--) {
      selectedLights[i] = selectedLights[i - 1];
      selectedIndices[i] = selectedIndices[i - 1];
      selectedScores[i] = selectedScores[i - 1];
      selectedPriorities[i] = selectedPriorities[i - 1];
    }
    selectedLights[insertAt] = light;
    selectedIndices[insertAt] = inputIndex;
    selectedScores[insertAt] = score;
    selectedPriorities[insertAt] = priority;
    selectedCount = nextCount;
  }
  return selectedCount;
}

const scratchSelectedPointIndices = new Int32Array(MAX_FORWARD_LIGHTS);
const scratchSelectedPointLights: Readonly<PointLight | SpotLight>[] = new Array(MAX_FORWARD_LIGHTS);
const scratchSelectedPointScores = new Float64Array(MAX_FORWARD_LIGHTS);
const scratchSelectedPointPriorities = new Float64Array(MAX_FORWARD_LIGHTS);
const scratchSelectedSpotIndices = new Int32Array(MAX_FORWARD_LIGHTS);
const scratchSelectedSpotLights: Readonly<PointLight | SpotLight>[] = new Array(MAX_FORWARD_LIGHTS);
const scratchSelectedSpotScores = new Float64Array(MAX_FORWARD_LIGHTS);
const scratchSelectedSpotPriorities = new Float64Array(MAX_FORWARD_LIGHTS);
