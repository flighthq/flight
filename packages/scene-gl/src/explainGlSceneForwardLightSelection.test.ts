import { createPointLight } from '@flighthq/lighting';
import type { GlSceneForwardLightList, SceneLightsLike } from '@flighthq/types';

import { explainGlSceneForwardLightSelection } from './explainGlSceneForwardLightSelection';

function lights(count: number): SceneLightsLike {
  return {
    ambient: null,
    directional: null,
    point: Array.from({ length: count }, () => createPointLight()),
  };
}

describe('explainGlSceneForwardLightSelection', () => {
  it('reports a required selection when input truncation would occur', () => {
    expect(explainGlSceneForwardLightSelection(lights(5))).toEqual({
      pointLightCount: 5,
      reason: 'selection-required',
      selectionPrepared: false,
      spotLightCount: 0,
    });
  });

  it('reports when a selection was prepared', () => {
    const prepared: GlSceneForwardLightList = { meshCount: 0, meshLightBlocks: [] };
    expect(explainGlSceneForwardLightSelection(lights(5), prepared).reason).toBe('selection-prepared');
  });

  it('reports when punctual inputs fit the fixed budget', () => {
    expect(explainGlSceneForwardLightSelection(lights(4)).reason).toBe('within-budget');
  });
});
