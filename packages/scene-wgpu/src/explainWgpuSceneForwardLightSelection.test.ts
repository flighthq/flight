import { createPointLight } from '@flighthq/lighting';

import { explainWgpuSceneForwardLightSelection } from './explainWgpuSceneForwardLightSelection';

describe('explainWgpuSceneForwardLightSelection', () => {
  it('distinguishes within-budget, required, and prepared selection', () => {
    const within = { ambient: null, directional: null, point: [createPointLight()] };
    expect(explainWgpuSceneForwardLightSelection(within).reason).toBe('within-budget');
    const excess = { ambient: null, directional: null, point: Array.from({ length: 5 }, () => createPointLight()) };
    expect(explainWgpuSceneForwardLightSelection(excess).reason).toBe('selection-required');
    expect(explainWgpuSceneForwardLightSelection(excess, { meshCount: 0, meshLightBlocks: [] }).reason).toBe(
      'selection-prepared',
    );
  });
});
