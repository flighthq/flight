import type {
  BoundingSphereLike,
  PointLight,
  SceneForwardLightSelection,
  SceneLightsLike,
  SpotLight,
} from '@flighthq/types';
import { MAX_FORWARD_LIGHTS } from '@flighthq/types';

import { getLightContributionAtBoundingSphere } from './lightAnalysis';

// Selects the strongest point/spot contributors for one object's forward-light budget. Point and
// spot lights compete for one combined MAX_FORWARD_LIGHTS budget. Ranking uses descriptor-side
// shader-equivalent attenuation at `bounds`; equal scores retain the scene input order (all points,
// then all spots), making captures reproducible. Zero-contribution lights are omitted.
//
// `out.point` and `out.spot` are reused mutable arrays. All inputs are read into fixed-size scratch
// before either output array is changed, so `out` may alias `lights`.
export function selectSceneForwardLights(
  out: SceneForwardLightSelection,
  lights: Readonly<SceneLightsLike>,
  bounds: Readonly<BoundingSphereLike>,
): void {
  let selectedCount = 0;
  let inputOrder = 0;

  const points = lights.point;
  if (points !== undefined) {
    for (let i = 0; i < points.length; i++) {
      selectedCount = insertSelectedLight(points[i], POINT_LIGHT_TYPE, inputOrder++, bounds, selectedCount);
    }
  }

  const spots = lights.spot;
  if (spots !== undefined) {
    for (let i = 0; i < spots.length; i++) {
      selectedCount = insertSelectedLight(spots[i], SPOT_LIGHT_TYPE, inputOrder++, bounds, selectedCount);
    }
  }

  const outPoints = out.point;
  const outSpots = out.spot;
  const outIndices = out.indices;
  outIndices.length = 0;
  outPoints.length = 0;
  outSpots.length = 0;
  for (let i = 0; i < selectedCount; i++) {
    outIndices.push(scratchSelectedOrders[i]);
    if (scratchSelectedTypes[i] === POINT_LIGHT_TYPE) {
      outPoints.push(scratchSelectedLights[i] as Readonly<PointLight>);
    } else {
      outSpots.push(scratchSelectedLights[i] as Readonly<SpotLight>);
    }
  }
}

function insertSelectedLight(
  light: Readonly<PointLight | SpotLight>,
  type: number,
  inputOrder: number,
  bounds: Readonly<BoundingSphereLike>,
  selectedCount: number,
): number {
  const score = getLightContributionAtBoundingSphere(light, bounds);
  if (!(score > 0)) return selectedCount;

  let insertAt = selectedCount;
  while (insertAt > 0) {
    const previous = insertAt - 1;
    if (score < scratchSelectedScores[previous]) break;
    if (score === scratchSelectedScores[previous] && inputOrder > scratchSelectedOrders[previous]) break;
    insertAt--;
  }
  if (insertAt >= MAX_FORWARD_LIGHTS) return selectedCount;

  const nextCount = Math.min(selectedCount + 1, MAX_FORWARD_LIGHTS);
  for (let i = nextCount - 1; i > insertAt; i--) {
    scratchSelectedLights[i] = scratchSelectedLights[i - 1];
    scratchSelectedOrders[i] = scratchSelectedOrders[i - 1];
    scratchSelectedScores[i] = scratchSelectedScores[i - 1];
    scratchSelectedTypes[i] = scratchSelectedTypes[i - 1];
  }
  scratchSelectedLights[insertAt] = light;
  scratchSelectedOrders[insertAt] = inputOrder;
  scratchSelectedScores[insertAt] = score;
  scratchSelectedTypes[insertAt] = type;
  return nextCount;
}

const POINT_LIGHT_TYPE = 0;
const SPOT_LIGHT_TYPE = 1;
const scratchSelectedLights: Readonly<PointLight | SpotLight>[] = new Array(MAX_FORWARD_LIGHTS);
const scratchSelectedOrders = new Int32Array(MAX_FORWARD_LIGHTS);
const scratchSelectedScores = new Float64Array(MAX_FORWARD_LIGHTS);
const scratchSelectedTypes = new Uint8Array(MAX_FORWARD_LIGHTS);
