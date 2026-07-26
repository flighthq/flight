import { createPointLight } from '@flighthq/lighting/contract';
import type { GlScene3DForwardLightList, Scene3DLightsLike } from '@flighthq/types/contract';

import { explainGlScene3DForwardLightSelection } from './explainGlScene3DForwardLightSelection';

function lights(count: number): Scene3DLightsLike {
  return {
    ambient: null,
    directional: null,
    point: Array.from({ length: count }, () => createPointLight()),
  };
}

describe('explainGlScene3DForwardLightSelection', () => {
  it('reports a required selection when input truncation would occur', () => {
    expect(explainGlScene3DForwardLightSelection(lights(5))).toEqual({
      pointLightCount: 5,
      reason: 'selection-required',
      selectionPrepared: false,
      spotLightCount: 0,
    });
  });

  it('reports when a selection was prepared', () => {
    const prepared: GlScene3DForwardLightList = { meshCount: 0, meshLightBlocks: [] };
    expect(explainGlScene3DForwardLightSelection(lights(5), prepared).reason).toBe('selection-prepared');
  });

  it('reports when punctual inputs fit the fixed budget', () => {
    expect(explainGlScene3DForwardLightSelection(lights(4)).reason).toBe('within-budget');
  });
});
