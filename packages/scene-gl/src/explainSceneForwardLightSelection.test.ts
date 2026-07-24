import { createPointLight } from '@flighthq/lighting';
import type { GlSceneForwardLightList, SceneLightsLike } from '@flighthq/types';

import { explainSceneForwardLightSelection } from './explainSceneForwardLightSelection';

function lights(count: number): SceneLightsLike {
  return {
    ambient: null,
    directional: null,
    point: Array.from({ length: count }, () => createPointLight()),
  };
}

describe('explainSceneForwardLightSelection', () => {
  it('reports a required selection when input truncation would occur', () => {
    expect(explainSceneForwardLightSelection(lights(5))).toEqual({
      pointLightCount: 5,
      reason: 'selection-required',
      selectionPrepared: false,
      spotLightCount: 0,
    });
  });

  it('reports when a selection was prepared', () => {
    const prepared: GlSceneForwardLightList = { meshCount: 0, meshLightBlocks: [] };
    expect(explainSceneForwardLightSelection(lights(5), prepared).reason).toBe('selection-prepared');
  });

  it('reports when punctual inputs fit the fixed budget', () => {
    expect(explainSceneForwardLightSelection(lights(4)).reason).toBe('within-budget');
  });
});
