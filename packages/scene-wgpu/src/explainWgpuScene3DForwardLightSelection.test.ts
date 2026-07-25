import { createPointLight } from '@flighthq/lighting';

import { explainWgpuScene3DForwardLightSelection } from './explainWgpuScene3DForwardLightSelection';

describe('explainWgpuScene3DForwardLightSelection', () => {
  it('distinguishes within-budget, required, and prepared selection', () => {
    const within = { ambient: null, directional: null, point: [createPointLight()] };
    expect(explainWgpuScene3DForwardLightSelection(within).reason).toBe('within-budget');
    const excess = { ambient: null, directional: null, point: Array.from({ length: 5 }, () => createPointLight()) };
    expect(explainWgpuScene3DForwardLightSelection(excess).reason).toBe('selection-required');
    expect(explainWgpuScene3DForwardLightSelection(excess, { meshCount: 0, meshLightBlocks: [] }).reason).toBe(
      'selection-prepared',
    );
  });
});
